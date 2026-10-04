import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { cachedProfilePhoto } from '../services/avatarCache';
import { palette } from '../features/connected/ui';

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/**
 * Round profile photo; shows initials when there is no photo or it fails to load.
 * Private photos are downloaded with the session token and shown from a local
 * file, so a new upload always appears as soon as its address changes.
 */
export function UserAvatar({ name, uri, size = 40, inverted = false }: { name: string; uri?: string | null; size?: number; inverted?: boolean }) {
  const [photo, setPhoto] = useState<{ remote: string; local: string } | null>(null);
  const [failedLocal, setFailedLocal] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) return undefined;
    let active = true;
    cachedProfilePhoto(uri)
      .then((local) => { if (active) setPhoto({ remote: uri, local }); })
      .catch((error) => { console.warn(`Profile photo could not be loaded: ${error instanceof Error ? error.message : String(error)}`); });
    return () => { active = false; };
  }, [uri]);

  const frame = { width: size, height: size, borderRadius: size / 2 };
  const local = uri && photo?.remote === uri && photo.local !== failedLocal ? photo.local : null;

  if (local) {
    return <Image key={local} source={{ uri: local }} style={[frame, styles.photo]} onError={() => setFailedLocal(local)} accessibilityLabel={`${name} profile photo`} />;
  }
  return <View style={[frame, styles.fallback, inverted && styles.fallbackInverted]} accessibilityLabel={`${name} initials`}>
    <Text style={[styles.initials, { fontSize: Math.round(size * 0.36) }, inverted && styles.initialsInverted]}>{initialsOf(name)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  photo: { backgroundColor: palette.greenSoft },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.greenSoft },
  fallbackInverted: { backgroundColor: palette.green },
  initials: { color: palette.green, fontWeight: '800' },
  initialsInverted: { color: '#fff' },
});
