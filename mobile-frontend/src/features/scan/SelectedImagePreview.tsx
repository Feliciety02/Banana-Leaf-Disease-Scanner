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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ccd7d0',
    borderStyle: 'dashed',
    backgroundColor: '#f1f4f2',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  title: { color: '#35433b', fontSize: 16, fontWeight: '700', marginTop: 10 },
  subtitle: { color: '#6a786f', fontSize: 13, marginTop: 3 },
});