import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { palette } from '../connected/ui';

export function ImageSelector({ onSelectCamera, onSelectGallery, disabled }: { onSelectCamera: () => void; onSelectGallery: () => void; disabled?: boolean }) {
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open camera" disabled={disabled} onPress={onSelectCamera} style={({ pressed }) => [styles.button, styles.cameraButton, (pressed || disabled) && styles.dim]}>
        <Ionicons name="camera" size={22} color="#fff" />
        <Text style={styles.cameraText}>Camera</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose from gallery" disabled={disabled} onPress={onSelectGallery} style={({ pressed }) => [styles.button, styles.galleryButton, (pressed || disabled) && styles.dim]}>
        <Ionicons name="images-outline" size={22} color={palette.green} />
        <Text style={styles.galleryText}>Gallery</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, minHeight: 52, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  cameraButton: { backgroundColor: palette.green, borderWidth: 1, borderColor: palette.green },
  galleryButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#b9cbc1' },
  cameraText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  galleryText: { color: '#245f45', fontSize: 15, fontWeight: '700' },
  dim: { opacity: 0.55 },
});