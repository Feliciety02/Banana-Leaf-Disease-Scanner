import { Directory, File, Paths } from 'expo-file-system';

const diagnosisImageDirectory = new Directory(Paths.document, 'diagnosis-images');

function safeExtension(uri: string): string {
  const extension = new File(uri).extension.toLowerCase();
  return /^\.(jpe?g|png|webp)$/.test(extension) ? extension : '.jpg';
}

export function persistDiagnosisImage(sourceUri: string, diagnosisId: string): string {
  diagnosisImageDirectory.create({ idempotent: true, intermediates: true });

  const source = new File(sourceUri);
  const destination = new File(
    diagnosisImageDirectory,
    `${diagnosisId}${safeExtension(sourceUri)}`,
  );

  if (destination.exists) {
    destination.delete();
  }

  source.copy(destination);
  return destination.uri;
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
