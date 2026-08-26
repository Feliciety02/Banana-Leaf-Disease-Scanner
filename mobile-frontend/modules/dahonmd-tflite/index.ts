import { requireNativeModule } from 'expo-modules-core';

// ── Production types ──────────────────────────────────────────────────────

export type ClassifyResult = {
  scores: number[];
  latencyMs: number;
  modelVersion: string;
  inputShape: number[];
  inputDtype: string;
  outputDtype: string;
  labels: string[];
};

// ── Benchmark types ───────────────────────────────────────────────────────

export type DeviceInfo = {
  device: {
    manufacturer: string;
    model: string;
    brand: string;
    hardware: string;
    board: string;
    device: string;
    product: string;
  };
  android: {
    version: string;
    sdk_int: number;
    security_patch: string;
  };
  cpu: {
    abi: string;
    all_abis: string[];
    available_processors: number;
  };
  memory: {
    total_ram_bytes: number;
    total_ram_mb: number;
    max_heap_bytes: number;
    available_heap_bytes: number;
  };
  java: {
    version: string;
    vm_name: string;
  };
};

export type PreprocessResult = {
  decodeMs: number;
  resizeMs: number;
  totalMs: number;
  pixelCount: number;
};

export type LatencyStats = {
  meanMs: number;
  stdDevMs: number;
  medianMs: number;
  p5Ms: number;
  p25Ms: number;
  p75Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  throughputImagesPerSecond: number;
};

export type BenchmarkResult = {
  modelVariant: string;
  modelFileSizeBytes: number;
  warmupRuns: number;
  measuredRuns: number;
  numThreads: number;
  inferenceTimingsMs: number[];
  latency: LatencyStats;
  memory: {
    usedHeapBytes: number;
    usedHeapMB: number;
    maxHeapBytes: number;
    totalHeapBytes: number;
  };
  output: {
    scores: number[];
    predictedClass: string;
    inputShape: number[];
    inputDtype: string;
    outputDtype: string;
  };
  inputQuantization: { scale: number; zeroPoint: number };
  outputQuantization: { scale: number; zeroPoint: number };
};

// ── Native bridge ─────────────────────────────────────────────────────────

type NativeModule = {
  classifyImage(uri: string): Promise<ClassifyResult>;
  getDeviceInfo(): Promise<DeviceInfo>;
  preprocessImage(uri: string): Promise<PreprocessResult>;
  benchmarkModel(
    uri: string,
    modelVariant: string,
    warmupRuns: number,
    measuredRuns: number,
    numThreads: number,
  ): Promise<BenchmarkResult>;
};

let native: NativeModule | undefined;

try {
  native = requireNativeModule('DahonMDTFLite');
} catch {
  native = undefined;
}

// ── Production API ────────────────────────────────────────────────────────

export function classifyImage(uri: string): Promise<ClassifyResult> {
  if (!native) {
    return Promise.reject(
      new Error(
        'DahonMDTFLite native module is not available. '
        + 'Run "npx expo prebuild --platform android" and build a development or production client.',
      ),
    );
  }
  return native.classifyImage(uri);
}

// ── Benchmark API ─────────────────────────────────────────────────────────

export function getDeviceInfo(): Promise<DeviceInfo> {
  if (!native) {
    return Promise.reject(new Error('DahonMDTFLite native module is not available.'));
  }
  return native.getDeviceInfo();
}

export function preprocessImage(uri: string): Promise<PreprocessResult> {
  if (!native) {
    return Promise.reject(new Error('DahonMDTFLite native module is not available.'));
  }
  return native.preprocessImage(uri);
}

export function benchmarkModel(
  uri: string,
  modelVariant: 'int8' | 'fp32',
  warmupRuns: number,
  measuredRuns: number,
  numThreads: number,
): Promise<BenchmarkResult> {
  if (!native) {
    return Promise.reject(new Error('DahonMDTFLite native module is not available.'));
  }
  return native.benchmarkModel(uri, modelVariant, warmupRuns, measuredRuns, numThreads);
}

export function isNativeAvailable(): boolean {
  return native !== undefined;
}
