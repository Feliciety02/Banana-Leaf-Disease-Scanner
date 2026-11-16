import { Directory, File, Paths } from 'expo-file-system';

const PHOTO_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'csv']);
// Profile photos are a deliberate cache that is refreshed elsewhere.
const KEEP_DIRECTORIES = new Set(['profile-photos']);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Camera shots, gallery picks and resized copies are left in the app cache
 * after each scan, while the saved scan keeps its own copy in app documents.
 * Removes those leftovers once they are a day old, so the app does not grow
 * by several megabytes with every scan. Returns the number of bytes freed.
 */
export function clearStalePhotoCache(now = Date.now()): number {
  let freed = 0;
  const visit = (directory: Directory, depth: number) => {
    if (depth > 4) return;
    let entries: (Directory | File)[] = [];
    try { entries = directory.list(); } catch { return; }
    for (const entry of entries) {
      if (entry instanceof Directory) {
        if (!KEEP_DIRECTORIES.has(entry.name)) visit(entry, depth + 1);
        continue;
      }
      const extension = entry.name.split('.').pop()?.toLowerCase() ?? '';
      if (!PHOTO_EXTENSIONS.has(extension)) continue;
      try {
        const modified = entry.modificationTime ?? now;
        if (now - modified < DAY_MS) continue;
        const size = entry.size ?? 0;
        entry.delete();
        freed += size;
      } catch {
        // A file in use or already gone is simply skipped.
      }
    }
  };
  try { visit(new Directory(Paths.cache), 0); } catch { /* cache unavailable */ }
  return freed;
}
