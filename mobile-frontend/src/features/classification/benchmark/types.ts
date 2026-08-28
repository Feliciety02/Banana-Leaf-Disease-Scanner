import type {
  BenchmarkResult,
  DeviceInfo,
  LatencyStats,
  PreprocessResult,
} from '../../../../modules/dahonmd-tflite';

export type ModelVariant = 'int8' | 'fp32';

export type BenchmarkConfig = {
  warmupRuns: number;
  measuredRuns: number;
  numThreads: number;
  imageUri: string;
};

export type PreprocessBenchmark = {
  decodeMs: number[];
  resizeMs: number[];
  totalMs: number[];
  mean: PreprocessStats;
};

export type PreprocessStats = {
  decodeMeanMs: number;
  decodeStdDevMs: number;
  resizeMeanMs: number;
  resizeStdDevMs: number;
  totalMeanMs: number;
  totalStdDevMs: number;
};

export type ModelBenchmark = {
  variant: ModelVariant;
  result: BenchmarkResult;
  preprocess: PreprocessBenchmark;
  endToEndMs: number[];
  endToEndStats: {
    meanMs: number;
    stdDevMs: number;
    medianMs: number;
    p95Ms: number;
    throughputPerSecond: number;
  };
};

export type FullBenchmarkReport = {
  schemaVersion: number;
  timestamp: string;
  device: DeviceInfo;
  config: BenchmarkConfig;
  preprocess: PreprocessStats;
  models: ModelBenchmark[];
  comparison: {
    int8_mean_latency_ms: number;
    fp32_mean_latency_ms: number | null;
    speedup_ratio: number | null;
    int8_model_size_bytes: number;
    fp32_model_size_bytes: number | null;
    size_reduction_ratio: number | null;
  } | null;
  thesis_table: {
    headers: string[];
    rows: string[][];
  };
};
