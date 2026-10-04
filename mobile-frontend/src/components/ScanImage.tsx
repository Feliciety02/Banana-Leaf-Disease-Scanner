import { useState } from 'react';
import { Image, type ImageStyle, type StyleProp, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { authenticatedImageSource } from '../services/api';
import { palette } from '../features/connected/ui';

export function ScanImage({ uri, style, compact = false, missingText = 'Photo not available', resizeMode = 'cover', onLoadError }: {
  uri?: string | null;
  style: StyleProp<ImageStyle>;
  compact?: boolean;
  missingText?: string;
  resizeMode?: 'cover' | 'contain';
  onLoadError?: () => void;
}) {
  const source = authenticatedImageSource(uri);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const failed = Boolean(source && failedUri === source.uri);

  if (!source || failed) {
    return <View style={[style, styles.placeholder]} accessibilityLabel={failed ? 'Scan photo could not load' : missingText}>
      <Ionicons name="image-outline" size={compact ? 23 : 32} color={palette.muted} />
      {!compact && <Text style={styles.message}>{failed ? 'Photo could not load. Check the connection and reopen this scan.' : missingText}</Text>}
    </View>;
  }

  return <Image source={source} style={style} resizeMode={resizeMode} accessibilityLabel="Banana leaf scan photo" onError={() => { setFailedUri(source.uri); onLoadError?.(); }} />;
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.greenSoft, gap: 8 },
  message: { color: palette.muted, fontSize: 13, textAlign: 'center', paddingHorizontal: 12 },
});
