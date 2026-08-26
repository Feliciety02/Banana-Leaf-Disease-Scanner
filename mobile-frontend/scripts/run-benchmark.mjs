#!/usr/bin/env node

/**
 * Thesis mobile benchmark runner.
 *
 * This script is a documentation/reference entry point. The actual benchmark
 * runs on-device via the native DahonMDTFLite module. To execute:
 *
 *   1. Build and install the app: npx expo run:android
 *   2. Capture a test image or use a gallery image URI
 *   3. Call the benchmark API from the app or a test harness
 *
 * The benchmark service at src/services/benchmark/ exports:
 *   - runFullBenchmark(config) — runs warmup + measured inference on INT8 and FP32
 *   - reportToCSV(report)      — thesis-ready CSV output
 *   - reportToJSON(report)     — thesis-ready JSON output
 *
 * The Android instrumented test at modules/dahonmd-tflite/android/src/androidTest/
 * provides direct TFLite timing without the Expo JS bridge overhead.
 *
 * Usage:
 *   npm run benchmark            — prints instructions
 *   npm run benchmark:android    — runs on-device instrumented tests
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outputDir = resolve(root, 'benchmark-results');

console.log('=== DahonMD Thesis Mobile Benchmark ===\n');
console.log('The benchmark must run on a physical Android device or emulator.');
console.log('');
console.log('Two benchmarking paths are available:\n');
console.log('1. INSTRUMENTED TEST (direct TFLite, no JS bridge overhead):');
console.log('   npm run benchmark:android');
console.log('   This runs BenchmarkDeviceProfileTest which outputs device info,');
console.log('   INT8/FP32 latency, model sizes, and memory to the test log.');
console.log('');
console.log('2. JS BENCHMARK SERVICE (full pipeline timing):');
console.log('   Import and call runFullBenchmark() from a React Native test or');
console.log('   development screen. This measures preprocessing + inference +');
console.log('   dequantization end-to-end.\n');

console.log('--- Required assets ---');
const int8Model = resolve(root, 'assets/models/ca_mobilenetv3_small_int8.tflite');
const fp32Model = resolve(root, 'assets/models/ca_mobilenetv3_small_fp32.tflite');

console.log(`INT8 model: ${existsSync(int8Model) ? 'FOUND' : 'MISSING'} — ${int8Model}`);
console.log(`FP32 model: ${existsSync(fp32Model) ? 'FOUND (optional)' : 'NOT FOUND'} — ${fp32Model}`);
console.log('');

if (!existsSync(int8Model)) {
  console.error('ERROR: INT8 model not found. Copy the trained model:');
  console.error('  cp ai/artifacts/configuration_4/ca_mobilenetv3_small_int8.tflite \\');
  console.error('    mobile-frontend/assets/models/');
  process.exit(1);
}

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, null);
}

const exampleReport = {
  schemaVersion: 1,
  timestamp: new Date().toISOString(),
  note: 'This is a template. Run the benchmark on-device to populate real values.',
  device: {
    device: { manufacturer: 'PENDING', model: 'PENDING', brand: '', hardware: '', board: '', device: '', product: '' },
    android: { version: 'PENDING', sdk_int: 0, security_patch: '' },
    cpu: { abi: 'PENDING', all_abis: [], available_processors: 0 },
    memory: { total_ram_bytes: 0, total_ram_mb: 0, max_heap_bytes: 0, available_heap_bytes: 0 },
    java: { version: '', vm_name: '' },
  },
  config: { warmupRuns: 10, measuredRuns: 50, numThreads: 1, imageUri: 'PENDING' },
  thesis_table: {
    headers: ['Metric', 'Preprocessing', 'INT8 Inference', 'INT8 End-to-End', 'FP32 Inference', 'FP32 End-to-End'],
    rows: [
      ['Mean latency (ms)', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING'],
      ['Std deviation (ms)', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING'],
      ['Median (ms)', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING'],
      ['P95 (ms)', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING'],
      ['Throughput (img/s)', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING'],
      ['Model size (bytes)', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING'],
      ['Warmup runs', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING'],
      ['Measured runs', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING'],
    ],
  },
};

const templatePath = resolve(outputDir, 'benchmark_report_template.json');
writeFileSync(templatePath, JSON.stringify(exampleReport, null, 2), 'utf8');
console.log(`Benchmark template written to: ${templatePath}`);
console.log('');
console.log('To collect results:');
console.log('  1. Install the app on the target device');
console.log('  2. Run: npm run benchmark:android');
console.log('  3. Capture the test log output');
console.log('  4. Parse the KEY=VALUE lines into the template JSON');
console.log('  5. Save as benchmark_results_<device>.json');
