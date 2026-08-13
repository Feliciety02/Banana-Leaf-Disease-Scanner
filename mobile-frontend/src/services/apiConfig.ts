// Both clients authenticate and synchronize against the single authoritative Laravel API.
const developmentApiUrl = 'http://10.0.2.2:8001/api';
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

function isPublicHttpsUrl(value: string): boolean {
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

if (!__DEV__ && (!configuredApiUrl || !isPublicHttpsUrl(configuredApiUrl))) {
  throw new Error(
    'A production mobile build requires EXPO_PUBLIC_API_URL to be a public HTTPS API URL.',
  );
}

export const API_URL = configuredApiUrl || developmentApiUrl;
