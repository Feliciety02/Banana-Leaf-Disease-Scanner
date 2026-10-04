import { Directory, File, Paths } from 'expo-file-system';

import { fetchPrivateImage } from './api';

const inFlight = new Map<string, Promise<string>>();

function cacheFile(url: string) {
  const directory = new Directory(Paths.cache, 'profile-photos');
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  // The server changes the address on every upload, so it doubles as the cache key.
  return new File(directory, `${url.replace(/[^a-z0-9]+/gi, '_').slice(-150)}.jpg`);
}

/**
 * Returns a local file for a private profile photo, downloading it once with
 * the session token. Showing the local file avoids handing the token to the
 * native image loader, which displayed initials instead of updated photos.
 */
export function cachedProfilePhoto(url: string): Promise<string> {
  const file = cacheFile(url);
  if (file.exists && file.size > 0) return Promise.resolve(file.uri);
  const pending = inFlight.get(url);
  if (pending) return pending;
  const next = fetchPrivateImage(url)
    .then((bytes) => {
      if (file.exists) file.delete();
      file.create();
      file.write(bytes);
      return file.uri;
    })
    .finally(() => { inFlight.delete(url); });
  inFlight.set(url, next);
  return next;
}
