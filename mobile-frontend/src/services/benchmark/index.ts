import {
  benchmarkModel,
  getDeviceInfo,
  preprocessImage,
} from '../../../modules/dahonmd-tflite';
import type { DeviceInfo, BenchmarkResult } from '../../../modules/dahonmd-tflite';
import type {
  BenchmarkConfig,
  FullBenchmarkReport,
  ModelBenchmark,
  ModelVariant,
  PreprocessBenchmark,
  PreprocessStats,
} from './types';

const DEFAULT_CONFIG: BenchmarkConfig = {
  warmupRuns: 10,
  measuredRuns: 50,
  numThreads: 1,
  imageUri: '',
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[Math.min(index, sorted.length - 1)];
}

function computePreprocessStats(decodeTimes: number[], resizeTimes: number[], totalTimes: number[]): PreprocessStats {
  return {
    decodeMeanMs: mean(decodeTimes),
    decodeStdDevMs: stdDev(decodeTimes),
    resizeMeanMs: mean(resizeTimes),
    resizeStdDevMs: stdDev(resizeTimes),
    totalMeanMs: mean(totalTimes),
    totalStdDevMs: stdDev(totalTimes),
  };
}

async function benchmarkPreprocess(
  imageUri: string,
  runs: number,
): Promise<PreprocessBenchmark> {
  const decodeMs: number[] = [];
  const resizeMs: number[] = [];
  const totalMs: number[] = [];

  for (let i = 0; i < runs; i++) {
    const result = await preprocessImage(imageUri);
    decodeMs.push(result.decodeMs);
    resizeMs.push(result.resizeMs);
    totalMs.push(result.totalMs);
  }

  const stats = computePreprocessStats(decodeMs, resizeMs, totalMs);

  return { decodeMs, resizeMs, totalMs, mean: stats };
}

async function benchmarkModelVariant(
  imageUri: string,
  variant: ModelVariant,
  config: BenchmarkConfig,
  preprocessResult: PreprocessBenchmark,
): Promise<ModelBenchmark> {
  const result = await benchmarkModel(
    imageUri,
    variant,
    config.warmupRuns,
    config.measuredRuns,
    config.numThreads,
  );

  const endToEndMs: number[] = result.inferenceTimingsMs.map(
    (infMs, i) => infMs + (preprocessResult.totalMs[i] || preprocessResult.mean.totalMeanMs),
  );

  const sorted = [...endToEndMs].sort((a, b) => a - b);
  const endToEndMean = mean(endToEndMs);

  return {
    variant,
    result,
    preprocess: preprocessResult,
    endToEndMs,
    endToEndStats: {
      meanMs: endToEndMean,
      stdDevMs: stdDev(endToEndMs),
      medianMs: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      throughputPerSecond: endToEndMean > 0 ? 1000 / endToEndMean : 0,
    },
  };
}

export async function runFullBenchmark(
  overrides: Partial<BenchmarkConfig> = {},
): Promise<FullBenchmarkReport> {
  const config = { ...DEFAULT_CONFIG, ...overrides };

  if (!config.imageUri) {
    throw new Error('imageUri is required for benchmarking. Provide a test image URI.');
  }

  const device = await getDeviceInfo();
  const preprocess = await benchmarkPreprocess(config.imageUri, config.measuredRuns);

  const models: ModelBenchmark[] = [];

  try {
    const int8 = await benchmarkModelVariant(config.imageUri, 'int8', config, preprocess);
    models.push(int8);
  } catch (error) {
    console.warn('INT8 benchmark failed:', error instanceof Error ? error.message : error);
  }

  try {
    const fp32 = await benchmarkModelVariant(config.imageUri, 'fp32', config, preprocess);
    models.push(fp32);
  } catch (error) {
    console.warn('FP32 benchmark skipped:', error instanceof Error ? error.message : error);
  }

  if (models.length === 0) {
    throw new Error('Both INT8 and FP32 benchmarks failed. No model files found in assets.');
  }

  const int8Model = models.find((m) => m.variant === 'int8');
  const fp32Model = models.find((m) => m.variant === 'fp32');

  const comparison = int8Model && fp32Model
    ? {
        int8_mean_latency_ms: int8Model.result.latency.meanMs,
        fp32_mean_latency_ms: fp32Model.result.latency.meanMs,
        speedup_ratio: fp32Model.result.latency.meanMs / int8Model.result.latency.meanMs,
        int8_model_size_bytes: int8Model.result.modelFileSizeBytes,
        fp32_model_size_bytes: fp32Model.result.modelFileSizeBytes,
        size_reduction_ratio: fp32Model.result.modelFileSizeBytes > 0
          ? 1 - int8Model.result.modelFileSizeBytes / fp32Model.result.modelFileSizeBytes
          : null,
      }
    : int8Model
      ? {
          int8_mean_latency_ms: int8Model.result.latency.meanMs,
          fp32_mean_latency_ms: null,
          speedup_ratio: null,
          int8_model_size_bytes: int8Model.result.modelFileSizeBytes,
          fp32_model_size_bytes: null,
          size_reduction_ratio: null,
        }
      : null;

  const thesisTable = buildThesisTable(config, preprocess.mean, models);

  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    device,
    config,
    preprocess: preprocess.mean,
    models,
    comparison,
    thesis_table: thesisTable,
  };
}

function buildThesisTable(
  config: BenchmarkConfig,
  preprocess: PreprocessStats,
  models: ModelBenchmark[],
): { headers: string[]; rows: string[][] } {
  const headers = [
    'Metric',
    'Preprocessing',
    'INT8 Inference',
    'INT8 End-to-End',
    'FP32 Inference',
    'FP32 End-to-End',
  ];

  const int8 = models.find((m) => m.variant === 'int8');
  const fp32 = models.find((m) => m.variant === 'fp32');

  const rows: string[][] = [
    [
      'Mean latency (ms)',
      preprocess.totalMeanMs.toFixed(3),
      int8 ? int8.result.latency.meanMs.toFixed(3) : '-',
      int8 ? int8.endToEndStats.meanMs.toFixed(3) : '-',
      fp32 ? fp32.result.latency.meanMs.toFixed(3) : '-',
      fp32 ? fp32.endToEndStats.meanMs.toFixed(3) : '-',
    ],
    [
      'Std deviation (ms)',
      preprocess.totalStdDevMs.toFixed(3),
      int8 ? int8.result.latency.stdDevMs.toFixed(3) : '-',
      int8 ? int8.endToEndStats.stdDevMs.toFixed(3) : '-',
      fp32 ? fp32.result.latency.stdDevMs.toFixed(3) : '-',
      fp32 ? fp32.endToEndStats.stdDevMs.toFixed(3) : '-',
    ],
    [
      'Median (ms)',
      '-',
      int8 ? int8.result.latency.medianMs.toFixed(3) : '-',
      int8 ? int8.endToEndStats.medianMs.toFixed(3) : '-',
      fp32 ? fp32.result.latency.medianMs.toFixed(3) : '-',
      fp32 ? fp32.endToEndStats.medianMs.toFixed(3) : '-',
    ],
    [
      'P95 (ms)',
      '-',
      int8 ? int8.result.latency.p95Ms.toFixed(3) : '-',
      int8 ? int8.endToEndStats.p95Ms.toFixed(3) : '-',
      fp32 ? fp32.result.latency.p95Ms.toFixed(3) : '-',
      fp32 ? fp32.endToEndStats.p95Ms.toFixed(3) : '-',
    ],
    [
      'Throughput (img/s)',
      preprocess.totalMeanMs > 0 ? (1000 / preprocess.totalMeanMs).toFixed(1) : '-',
      int8 ? int8.result.latency.throughputImagesPerSecond.toFixed(1) : '-',
      int8 ? int8.endToEndStats.throughputPerSecond.toFixed(1) : '-',
      fp32 ? fp32.result.latency.throughputImagesPerSecond.toFixed(1) : '-',
      fp32 ? fp32.endToEndStats.throughputPerSecond.toFixed(1) : '-',
    ],
    [
      'Model size (bytes)',
      '-',
      int8 ? String(int8.result.modelFileSizeBytes) : '-',
      '-',
      fp32 ? String(fp32.result.modelFileSizeBytes) : '-',
      '-',
    ],
    [
      'Warmup runs',
      '-',
      int8 ? String(int8.result.warmupRuns) : '-',
      '-',
      fp32 ? String(fp32.result.warmupRuns) : '-',
      '-',
    ],
    [
      'Measured runs',
      '-',
      int8 ? String(int8.result.measuredRuns) : '-',
      '-',
      fp32 ? String(fp32.result.measuredRuns) : '-',
      '-',
    ],
  ];

  return { headers, rows };
}

export function reportToCSV(report: FullBenchmarkReport): string {
  const lines: string[] = [];

  lines.push('# DahonMD Mobile Benchmark Report');
  lines.push(`# Timestamp: ${report.timestamp}`);
  lines.push(`# Device: ${report.device.device.manufacturer} ${report.device.device.model}`);
  lines.push(`# Android: ${report.device.android.version} (SDK ${report.device.android.sdk_int})`);
  lines.push(`# CPU ABI: ${report.device.cpu.abi}`);
  lines.push(`# RAM: ${report.device.memory.total_ram_mb} MB`);
  lines.push(`# Threads: ${report.config.numThreads}`);
  lines.push(`# Warmup: ${report.config.warmupRuns}, Measured: ${report.config.measuredRuns}`);
  lines.push('');

  lines.push(report.thesis_table.headers.join(','));
  for (const row of report.thesis_table.rows) {
    lines.push(row.join(','));
  }
  lines.push('');

  lines.push('# Per-run inference timings (ms)');
  for (const model of report.models) {
    lines.push(`# ${model.variant.toUpperCase()}`);
    lines.push(model.result.inferenceTimingsMs.map((t) => t.toFixed(4)).join(','));
  }
  lines.push('');

  if (report.comparison) {
    lines.push('# Comparison');
    lines.push(`# INT8 mean: ${report.comparison.int8_mean_latency_ms.toFixed(3)} ms`);
    if (report.comparison.fp32_mean_latency_ms !== null) {
      lines.push(`# FP32 mean: ${report.comparison.fp32_mean_latency_ms.toFixed(3)} ms`);
      lines.push(`# Speedup: ${report.comparison.speedup_ratio?.toFixed(2)}x`);
    }
    lines.push(`# INT8 size: ${report.comparison.int8_model_size_bytes} bytes`);
    if (report.comparison.fp32_model_size_bytes !== null) {
      lines.push(`# FP32 size: ${report.comparison.fp32_model_size_bytes} bytes`);
      lines.push(`# Size reduction: ${((report.comparison.size_reduction_ratio ?? 0) * 100).toFixed(1)}%`);
    }
  }

  return lines.join('\n');
}

export function reportToJSON(report: FullBenchmarkReport): string {
  return JSON.stringify(report, null, 2);
}
