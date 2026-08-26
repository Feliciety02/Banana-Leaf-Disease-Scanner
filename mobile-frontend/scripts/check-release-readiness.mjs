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

if (process.argv.includes('--report')) console.log(JSON.stringify({ ready: problems.length === 0, problems }, null, 2));
if (problems.length) {
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log('Thesis mobile release contract is complete.');
}
