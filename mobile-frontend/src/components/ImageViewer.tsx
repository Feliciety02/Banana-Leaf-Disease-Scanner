import { Image, type ImageSourcePropType, Pressable, Modal, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { palette } from '../features/connected/ui';
import { ScanImage } from './ScanImage';

/**
 * Full-screen photo preview. `uri` is a scan photo (local file or protected
 * server URL); `source` is a bundled image such as a guide example.
 */
export function ImageViewer({ uri, source, title = 'Photo preview', visible, onClose }: { uri?: string | null; source?: ImageSourcePropType | null; title?: string; visible: boolean; onClose: () => void }) {
  if (!uri && !source) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close image viewer" onPress={onClose} style={styles.scrim} />
        <View style={styles.header}>
          <View style={styles.heading}><Ionicons name="image-outline" size={20} color={palette.lime} /><Text style={styles.title} numberOfLines={1}>{title}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close image viewer" onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={23} color="#fff" />
          </Pressable>
        </View>
        {uri
          ? <ScanImage uri={uri} style={styles.image} resizeMode="contain" />
          : <Image source={source!} style={styles.image} resizeMode="contain" accessibilityLabel={title} />}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1812', justifyContent: 'center', alignItems: 'center' },
  scrim: { ...StyleSheet.absoluteFill },
  header: { position: 'absolute', top: 42, left: 18, right: 18, zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 },
  title: { color: '#fff', fontSize: 17, fontWeight: '800', flexShrink: 1 },
  closeButton: { width: 44, height: 44, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  image: { width: '92%', height: '75%', borderRadius: 14 },
});
