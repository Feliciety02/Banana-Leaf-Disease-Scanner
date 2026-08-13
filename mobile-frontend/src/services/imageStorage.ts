import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { getHistoryResize, ImageDimensions } from './imagePolicy';

const diagnosisImageDirectory = new Directory(Paths.document, 'diagnosis-images');
const SAVED_IMAGE_QUALITY = 0.82;

function safeExtension(uri: string): string {
  const extension = new File(uri).extension.toLowerCase();
  return /^\.(jpe?g|png|webp)$/.test(extension) ? extension : '.jpg';
}

export async function persistDiagnosisImage(
  sourceUri: string,
  diagnosisId: string,
  dimensions: ImageDimensions | null,
): Promise<string> {
  diagnosisImageDirectory.create({ idempotent: true, intermediates: true });

  let copySource = new File(sourceUri);
  let temporaryFile: File | null = null;
  let extension = safeExtension(sourceUri);

  try {
    const context = ImageManipulator.manipulate(sourceUri);
    let renderedImage: Awaited<ReturnType<typeof context.renderAsync>> | null = null;

    try {
      const resize = getHistoryResize(dimensions);
      if (resize) {
        context.resize(resize);
      }

      renderedImage = await context.renderAsync();
      const optimized = await renderedImage.saveAsync({
        compress: SAVED_IMAGE_QUALITY,
        format: SaveFormat.JPEG,
      });
      temporaryFile = new File(optimized.uri);
      copySource = temporaryFile;
      extension = '.jpg';
    } finally {
      renderedImage?.release();
      context.release();
    }
  } catch {
    // Saving the original is safer than losing a diagnosis if optimization fails.
  }

  const destination = new File(diagnosisImageDirectory, `${diagnosisId}${extension}`);

  try {
    if (destination.exists) {
      destination.delete();
    }

    copySource.copy(destination);
    return destination.uri;
  } finally {
    try {
      if (temporaryFile?.exists) {
        temporaryFile.delete();
      }
    } catch {
      // Cache cleanup failure must not invalidate an otherwise successful save.
    }
  }
}

export function deletePersistedDiagnosisImage(uri: string | null): void {
  if (!uri || !uri.startsWith(`${diagnosisImageDirectory.uri}/`)) {
    return;
  }

  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // A missing image must not prevent its database record from being removed.
  }
}

export function cleanupOrphanedDiagnosisImages(referencedUris: string[]): number {
  if (!diagnosisImageDirectory.exists) return 0;
  const referenced = new Set(referencedUris);
  let removed = 0;

  for (const entry of diagnosisImageDirectory.list()) {
    if (entry instanceof File && !referenced.has(entry.uri)) {
      try {
        entry.delete();
        removed += 1;
      } catch {
        // Cleanup is best effort and must never block app startup.
      }
    }
  }

  return removed;
}
