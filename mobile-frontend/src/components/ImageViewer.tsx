import { Pressable, Image, Modal, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { palette } from '../features/connected/ui';

export function ImageViewer({ uri, visible, onClose }: { uri: string | null; visible: boolean; onClose: () => void }) {
  if (!uri) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close image viewer" onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close image viewer" onPress={onClose} style={styles.scrim} />
        <Image source={{ uri }} style={styles.image} resizeMode="contain" />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  scrim: { ...StyleSheet.absoluteFill },
  closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  image: { width: '92%', height: '75%' },
});
