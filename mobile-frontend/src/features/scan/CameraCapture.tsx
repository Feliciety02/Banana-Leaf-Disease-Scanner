import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';

export function CameraCapture({ visible, onClose, onCapture }: { visible: boolean; onClose: () => void; onCapture: (uri: string) => void }) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [flashOn, setFlashOn] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');

  const capture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    setError('');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) onCapture(photo.uri);
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : 'The photo could not be captured.');
    } finally {
      setCapturing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView ref={cameraRef} style={styles.camera} facing="back" enableTorch={flashOn}>
            <View style={styles.topBar}>
              <Pressable accessibilityRole="button" accessibilityLabel="Close camera" onPress={onClose} style={styles.topButton}>
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={flashOn ? 'Turn flash off' : 'Turn flash on'} onPress={() => setFlashOn((value) => !value)} style={styles.topButton}>
                <Ionicons name={flashOn ? 'flash' : 'flash-off'} size={22} color="#fff" />
              </Pressable>
            </View>
            <View style={styles.guide}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <Text style={styles.hint}>Center one leaf</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Take photo" disabled={capturing} onPress={capture} style={[styles.shutterOuter, capturing && styles.shutterDisabled]}>
              {capturing ? <ActivityIndicator color="#fff" /> : <View style={styles.shutterInner} />}
            </Pressable>
          </CameraView>
        ) : (
          <View style={styles.permission}>
            {permission?.canAskAgain === false ? (
              <>
                <Ionicons name="camera-outline" size={40} color="#cfe0d8" />
                <Text style={styles.permissionTitle}>Camera access needed</Text>
                <Text style={styles.permissionText}>Allow camera access in device settings to photograph a leaf.</Text>
              </>
            ) : (
              <>
                <ActivityIndicator color="#d8ef78" />
                <Text style={styles.permissionTitle}>Requesting camera access</Text>
              </>
            )}
            <Pressable accessibilityRole="button" onPress={requestPermission} style={styles.allowButton}><Text style={styles.allowText}>Allow camera access</Text></Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1812' },
  camera: { flex: 1 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 44, paddingBottom: 12 },
  topButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(22,35,31,0.55)', alignItems: 'center', justifyContent: 'center' },
  guide: { position: 'absolute', top: 0, left: 24, right: 24, bottom: 96, justifyContent: 'center', alignItems: 'center' },
  corner: { position: 'absolute', width: 64, height: 64, borderColor: '#fff' },
  cornerTL: { top: 72, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 24 },
  cornerTR: { top: 72, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 24 },
  cornerBL: { bottom: 72, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 24 },
  cornerBR: { bottom: 72, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 24 },
  hint: { position: 'absolute', top: 200, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 15, fontWeight: '700', backgroundColor: 'rgba(22,35,31,0.68)', alignSelf: 'center', borderRadius: 30, paddingHorizontal: 18, paddingVertical: 8, overflow: 'hidden' },
  error: { position: 'absolute', bottom: 150, left: 24, right: 24, color: '#ffb4ae', backgroundColor: 'rgba(120,20,16,0.72)', fontSize: 13, textAlign: 'center', borderRadius: 12, padding: 10, overflow: 'hidden' },
  shutterOuter: { position: 'absolute', bottom: 44, alignSelf: 'center', width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#d8ef78' },
  shutterDisabled: { opacity: 0.6 },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 36 },
  permissionTitle: { color: '#eaf3ee', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  permissionText: { color: '#a9bfb4', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  allowButton: { marginTop: 10, backgroundColor: '#d8ef78', borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12 },
  allowText: { color: '#174d3a', fontWeight: '800' },
});