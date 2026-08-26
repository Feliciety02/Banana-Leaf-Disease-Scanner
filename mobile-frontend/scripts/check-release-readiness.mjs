import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const app = readFileSync(resolve(root, 'App.tsx'), 'utf8');
const banned = ['services/auth', 'services/database', 'services/sync', 'services/http', 'modelComparison'];
const problems = banned.filter((value) => app.includes(value)).map((value) => `Production App.tsx imports legacy ${value}.`);

if (!existsSync(resolve(root, 'assets/models/ca_mobilenetv3_small_int8.tflite'))) {
  problems.push('PENDING EXPERIMENTAL VALIDATION: final INT8 TFLite model is not bundled.');
}
if (!existsSync(resolve(root, 'modules/dahonmd-tflite'))) {
  problems.push('PENDING EXPERIMENTAL VALIDATION: native DahonMDTFLite module is not implemented.');
}
if (!existsSync(resolve(root, 'modules/dahonmd-tflite/android/src/main/java/expo/modules/dahonmdtflite/DahonMDTFLiteModule.kt'))) {
  problems.push('PENDING EXPERIMENTAL VALIDATION: Kotlin TFLite module source is missing.');
}

const inferencePath = resolve(root, 'src/services/inference.ts');
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
