import { Image, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { palette } from '../connected/ui';

export function SelectedImagePreview({ uri }: { uri: string | null }) {
  if (!uri) {
    return (
      <View accessibilityLabel="No photo selected" style={styles.frame}>
        <Ionicons name="image-outline" size={40} color="#a7b4ad" />
        <Text style={styles.title}>No photo selected</Text>
        <Text style={styles.subtitle}>Center one leaf in good light.</Text>
      </View>
    );
  }
  return (
    <View style={styles.frame}>
      <Image source={{ uri }} style={styles.image} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#cdd8d1',
    borderStyle: 'dashed',
    backgroundColor: '#f2f5f3',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  title: { color: palette.ink, fontSize: 16, fontWeight: '800', marginTop: 10 },
  subtitle: { color: palette.muted, fontSize: 13, marginTop: 3 },
});