import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const productionSources = [
  'index.ts',
  'src/app/App.tsx',
  'src/shared/components/AppErrorBoundary.tsx',
  'src/features/classification/disease-data.ts',
  'src/features/classification/types.ts',
  'src/features/classification/inference.ts',
  'src/features/classification/preprocessing.ts',
  'modules/dahonmd-tflite/index.ts',
  'modules/dahonmd-tflite/android/src/main/java/expo/modules/dahonmdtflite/DahonMDTFLiteModule.kt',
];
const banned = [
  ['services/auth', 'legacy authentication'],
  ['services/database', 'legacy database access'],
  ['services/sync', 'legacy synchronization'],
  ['services/http', 'legacy HTTP access'],
  ['modelcomparison', 'legacy remote model comparison'],
  ['fetch(', 'network fetch'],
  ['xmlhttprequest', 'network request'],
  ['netinfo', 'connectivity dependency'],
  ['expo_public_api_url', 'backend URL'],
  ['safe_development_result', 'simulated inference fallback'],
  ['simulated', 'simulated inference result'],
];
const problems = [];
const modelRelativePath = 'assets/models/ca_mobilenetv3_small_int8.tflite';
const modelPath = resolve(root, modelRelativePath);

for (const relativePath of productionSources) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) {
    problems.push(`Production source is missing: ${relativePath}.`);
    continue;
  }
  const source = readFileSync(path, 'utf8').toLowerCase();
  for (const [needle, description] of banned) {
    if (source.includes(needle)) problems.push(`${relativePath} contains ${description} (${needle}).`);
  }
}

if (!existsSync(modelPath)) {
  problems.push('PENDING EXPERIMENTAL VALIDATION: final INT8 TFLite model is not bundled.');
} else {
  const model = readFileSync(modelPath);
  if (model.length === 0) {
    problems.push(`Final INT8 TFLite model is empty: ${modelRelativePath}.`);
  } else if (model.length < 8 || model.subarray(4, 8).toString('ascii') !== 'TFL3') {
    problems.push(`Final INT8 model is not a valid TFLite FlatBuffer (missing TFL3 identifier): ${modelRelativePath}.`);
  }
}
if (!existsSync(resolve(root, 'modules/dahonmd-tflite'))) {
  problems.push('PENDING EXPERIMENTAL VALIDATION: native DahonMDTFLite module is not implemented.');
}
if (!existsSync(resolve(root, 'modules/dahonmd-tflite/android/src/main/java/expo/modules/dahonmdtflite/DahonMDTFLiteModule.kt'))) {
  problems.push('PENDING EXPERIMENTAL VALIDATION: Kotlin TFLite module source is missing.');
}

const appConfigPath = resolve(root, 'app.json');
if (existsSync(appConfigPath)) {
  const appConfig = JSON.parse(readFileSync(appConfigPath, 'utf8'));
  const assetPlugin = appConfig.expo?.plugins?.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-asset',
  );
  const configuredAssets = assetPlugin?.[1]?.assets;
  if (!Array.isArray(configuredAssets)
      || !configuredAssets.includes('./assets/models/ca_mobilenetv3_small_int8.tflite')) {
    problems.push('app.json does not link the production INT8 model with the expo-asset config plugin.');
  }
} else {
  problems.push('Expo app config is missing: app.json.');
}

const inferencePath = resolve(root, 'src/features/classification/inference.ts');
if (existsSync(inferencePath)) {
  const inference = readFileSync(inferencePath, 'utf8');
  if (inference.includes('NativeModules.DahonMDTFLite')) {
    problems.push('inference.ts still uses raw NativeModules bridge instead of the typed module import.');
  }
  if (inference.includes('PENDING EXPERIMENTAL VALIDATION')) {
    problems.push('inference.ts still contains the PENDING fallback error message.');
  }
}

if (process.argv.includes('--report')) console.log(JSON.stringify({ ready: problems.length === 0, problems }, null, 2));
if (problems.length) {
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log('Thesis mobile release contract is complete.');
}
