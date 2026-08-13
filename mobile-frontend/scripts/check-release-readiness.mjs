import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appConfig = JSON.parse(readFileSync(resolve(projectRoot, 'app.json'), 'utf8'));
const easConfig = JSON.parse(readFileSync(resolve(projectRoot, 'eas.json'), 'utf8'));
const inferenceSource = readFileSync(
  resolve(projectRoot, 'src/services/inference.ts'),
  'utf8',
);
const requiredAssets = [
  appConfig.expo?.icon,
  appConfig.expo?.splash?.image,
  appConfig.expo?.android?.adaptiveIcon?.foregroundImage,
].filter(Boolean);
const reportOnly = process.argv.includes('--report');
const issues = [];

const localProductionEnv = resolve(projectRoot, '.env.production');
if (existsSync(localProductionEnv)) {
  for (const rawLine of readFileSync(localProductionEnv, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) {
      continue;
    }

    const separator = line.indexOf('=');
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function addIssue(message) {
  issues.push(message);
}

function isPublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isPrivateHost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '10.0.2.2' ||
      host === 'example.com' ||
      host.endsWith('.example.com') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);

    return url.protocol === 'https:' && !isPrivateHost;
  } catch {
    return false;
  }
}

const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
if (!apiUrl) {
  addIssue('Set EXPO_PUBLIC_API_URL in the EAS production environment.');
} else if (!isPublicHttpsUrl(apiUrl)) {
  addIssue('EXPO_PUBLIC_API_URL must be a public HTTPS URL, not localhost or a LAN address.');
}

for (const [name, description] of [
  ['PLAY_STORE_PRIVACY_POLICY_URL', 'privacy policy'],
  ['PLAY_STORE_ACCOUNT_DELETION_URL', 'account deletion page'],
]) {
  const value = process.env[name]?.trim();
  if (!value || !isPublicHttpsUrl(value)) {
    addIssue(`Set ${name} to the public HTTPS ${description} URL.`);
  }
}

if (
  inferenceSource.includes("diseaseId: 'development-unconfigured'") ||
  inferenceSource.includes('isSimulated: true')
) {
  addIssue('Replace the simulated inference service with the validated model and exact label map.');
}

if (!appConfig.expo?.android?.package) {
  addIssue('Set expo.android.package in app.json.');
}

if (!Number.isInteger(appConfig.expo?.android?.versionCode)) {
  addIssue('Set expo.android.versionCode to an integer in app.json.');
}

for (const assetPath of requiredAssets) {
  if (!existsSync(resolve(projectRoot, assetPath))) {
    addIssue(`Required release asset is missing: ${assetPath}`);
  }
}

const permissionPlugins = JSON.stringify(appConfig.expo?.plugins ?? []);
if (!permissionPlugins.includes('cameraPermission') || !permissionPlugins.includes('microphonePermission')) {
  addIssue('Keep explicit camera/photo permission copy and microphonePermission disabled.');
}

if (!appConfig.expo?.extra?.eas?.projectId) {
  addIssue('Run `eas init` to link this app and add expo.extra.eas.projectId.');
}

if (!easConfig.build?.production || easConfig.build.production.autoIncrement !== true) {
  addIssue('Keep an auto-incrementing production profile in eas.json.');
}

if (issues.length === 0) {
  console.log('Production release check passed.');
  process.exit(0);
}

console.log(`Production release has ${issues.length} blocker${issues.length === 1 ? '' : 's'}:`);
for (const issue of issues) {
  console.log(`- ${issue}`);
}

if (reportOnly) {
  console.log('\nReport mode only: preview development can continue.');
  process.exit(0);
}

process.exit(1);
