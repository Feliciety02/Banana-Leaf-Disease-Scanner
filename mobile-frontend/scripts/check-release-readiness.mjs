import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const productionSources = [
  'index.ts',
  'src/app/App.tsx',
  'src/shared/components/AppErrorBoundary.tsx',
  'src/services/api.ts',
  'src/services/diagnosisSync.ts',
  'src/services/backgroundSync.ts',
  'src/services/mobileSecurity.ts',
  'src/storage/localDiagnoses.ts',
  'src/features/offline/LocalHistory.tsx',
  'src/features/connected/FarmerWorkspace.tsx',
  'src/features/connected/ConnectedWorkspace.tsx',
  'src/features/connected/AuthModal.tsx',
  'src/features/connected/AdminWorkspace.tsx',
  'src/features/connected/ui.tsx',
  'src/features/classification/disease-data.ts',
  'src/features/classification/types.ts',
  'src/features/classification/inference.ts',
  'src/features/classification/preprocessing.ts',
  'modules/dahonmd-tflite/index.ts',
  'modules/dahonmd-tflite/android/src/main/java/expo/modules/dahonmdtflite/DahonMDTFLiteModule.kt',
];
const offlineBoundarySources = [
  'src/features/classification/disease-data.ts',
  'src/features/classification/types.ts',
  'src/features/classification/inference.ts',
  'src/features/classification/preprocessing.ts',
  'modules/dahonmd-tflite/index.ts',
  'modules/dahonmd-tflite/android/build.gradle',
  'modules/dahonmd-tflite/plugin/src/index.ts',
  'modules/dahonmd-tflite/android/src/main/java/expo/modules/dahonmdtflite/DahonMDTFLiteModule.kt',
];
const bannedFromOfflineBoundary = [
  ['services/auth', 'legacy authentication'],
  ['services/database', 'legacy database access'],
  ['services/sync', 'legacy synchronization'],
  ['services/http', 'legacy HTTP access'],
  ['modelcomparison', 'legacy remote model comparison'],
  ['fetch(', 'network fetch'],
  ['xmlhttprequest', 'network request'],
  ['netinfo', 'connectivity dependency'],
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
}

for (const relativePath of offlineBoundarySources) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) continue;
  const source = readFileSync(path, 'utf8').toLowerCase();
  for (const [needle, description] of bannedFromOfflineBoundary) {
    if (source.includes(needle)) problems.push(`${relativePath} violates the offline inference boundary with ${description} (${needle}).`);
  }
}

const apiServicePath = resolve(root, 'src/services/api.ts');
if (existsSync(apiServicePath)) {
  const apiService = readFileSync(apiServicePath, 'utf8').toLowerCase();
  if (!apiService.includes("from 'expo-secure-store'")) problems.push('Connected session tokens are not stored with Expo SecureStore.');
  if (!apiService.includes('expo_public_api_url')) problems.push('Connected workspace does not use EXPO_PUBLIC_API_URL.');
  if (!apiService.includes('export async function deleteaccount')) problems.push('Connected accounts do not expose an authenticated deletion operation.');
  if (!apiService.includes("connected features require an https api url")) problems.push('Production API requests do not reject insecure HTTP configuration.');
  if (!apiService.includes('when_unlocked_this_device_only')) problems.push('SecureStore credentials are not restricted to an unlocked device and non-migrating keychain class.');
  if (!apiService.includes('url.origin !== apiorigin')) problems.push('Authenticated media URLs are not restricted to the configured API origin.');
}

const environmentExamplePath = resolve(root, '.env.example');
if (existsSync(environmentExamplePath)) {
  const environmentExample = readFileSync(environmentExamplePath, 'utf8');
  for (const variable of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_PRIVACY_URL', 'EXPO_PUBLIC_ACCOUNT_DELETION_URL']) {
    if (!environmentExample.includes(`${variable}=`)) problems.push(`Mobile environment example is missing ${variable}.`);
  }
} else {
  problems.push('Mobile environment example is missing: .env.example.');
}

const farmerWorkspacePath = resolve(root, 'src/features/connected/FarmerWorkspace.tsx');
if (existsSync(farmerWorkspacePath)) {
  const farmerWorkspace = readFileSync(farmerWorkspacePath, 'utf8').toLowerCase();
  if (!farmerWorkspace.includes('delete my account')) problems.push('Farmer workspace has no discoverable in-app account deletion control.');
  if (!farmerWorkspace.includes('privacypolicyurl')) problems.push('Farmer workspace has no in-app privacy policy link.');
}

const localStoragePath = resolve(root, 'src/storage/localDiagnoses.ts');
if (existsSync(localStoragePath)) {
  const localStorage = readFileSync(localStoragePath, 'utf8').toLowerCase();
  if (!localStorage.includes('deletelocalaccountdata')) problems.push('Account deletion does not clean account-linked mobile records.');
}

const nativeBuildPath = resolve(root, 'modules/dahonmd-tflite/android/build.gradle');
if (existsSync(nativeBuildPath)) {
  const nativeBuild = readFileSync(nativeBuildPath, 'utf8');
  if (nativeBuild.includes('org.tensorflow:tensorflow-lite:')) problems.push('Native module still bundles the legacy TensorFlow Lite runtime without confirmed 16 KB page-size compatibility.');
  if (!nativeBuild.includes('com.google.ai.edge.litert:litert:1.4.0')
      || !nativeBuild.includes('com.google.ai.edge.litert:litert-api:1.4.0')) {
    problems.push('Native module does not use the pinned 16 KB-compatible LiteRT runtime and Interpreter API.');
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
  if (appConfig.expo?.android?.allowBackup !== false) problems.push('Android release permits automatic backup of private app data.');
  const blockedPermissions = appConfig.expo?.android?.blockedPermissions ?? [];
  for (const permission of ['android.permission.READ_MEDIA_IMAGES', 'android.permission.RECORD_AUDIO', 'android.permission.VIBRATE']) {
    if (!blockedPermissions.includes(permission)) problems.push(`Android release does not block unnecessary permission: ${permission}.`);
  }
  if (appConfig.expo?.ios?.entitlements?.['com.apple.developer.default-data-protection'] !== 'NSFileProtectionComplete') {
    problems.push('iOS release does not apply complete file protection to private app data.');
  }
  if (appConfig.expo?.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsArbitraryLoads !== false) {
    problems.push('iOS release does not explicitly prohibit arbitrary insecure network loads.');
  }
  const secureStorePlugin = appConfig.expo?.plugins?.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-secure-store',
  );
  if (secureStorePlugin?.[1]?.configureAndroidBackup !== true) problems.push('SecureStore Android backup exclusions are not configured.');
} else {
  problems.push('Expo app config is missing: app.json.');
}

const packagePath = resolve(root, 'package.json');
if (!existsSync(packagePath) || !readFileSync(packagePath, 'utf8').includes('expo-screen-capture')) {
  problems.push('Sensitive screens are not protected by Expo ScreenCapture.');
}
const mobileSecurityPath = resolve(root, 'src/services/mobileSecurity.ts');
if (existsSync(mobileSecurityPath)) {
  const mobileSecurity = readFileSync(mobileSecurityPath, 'utf8').toLowerCase();
  if (!mobileSecurity.includes('usepreventscreencapture')) problems.push('Mobile privacy service does not block screenshots and recordings.');
  if (!mobileSecurity.includes('enableappswitcherprotectionasync')) problems.push('iOS app-switcher snapshots are not protected.');
}
const appSourcePath = resolve(root, 'src/app/App.tsx');
if (existsSync(appSourcePath) && !readFileSync(appSourcePath, 'utf8').includes('useMobilePrivacyProtection()')) {
  problems.push('The mobile privacy protection hook is not active in the app root.');
}

const nativePluginPath = resolve(root, 'modules/dahonmd-tflite/plugin/src/index.js');
if (!existsSync(nativePluginPath) || !readFileSync(nativePluginPath, 'utf8').includes('android:usesCleartextTraffic')) {
  problems.push('Android manifest generation does not explicitly block cleartext traffic.');
}

const errorBoundaryPath = resolve(root, 'src/shared/components/AppErrorBoundary.tsx');
if (existsSync(errorBoundaryPath)) {
  const errorBoundary = readFileSync(errorBoundaryPath, 'utf8');
  if (errorBoundary.includes('console.error') && !errorBoundary.includes('__DEV__')) {
    problems.push('Production UI errors may be written to the native device log.');
  }
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
