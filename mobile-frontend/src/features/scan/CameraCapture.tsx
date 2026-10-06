import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { useT } from '../../i18n';

const CONTROL_GREEN = '#18543c';

export function CameraCapture({ visible, onClose, onCapture, onChooseGallery }: { visible: boolean; onClose: () => void; onCapture: (uri: string) => void; onChooseGallery: () => void }) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [flashOn, setFlashOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');
  const { t } = useT();

  useEffect(() => {
    if (!visible) {
      setFlashOn(false);
      setCameraReady(false);
      setError('');
    }
  }, [visible]);

  const capture = async () => {
    if (!cameraRef.current || !cameraReady || capturing) return;
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
          <CameraView ref={cameraRef} style={styles.camera} facing="back" enableTorch={flashOn} onCameraReady={() => setCameraReady(true)}>
            <View style={styles.topBar}>
              <Pressable accessibilityRole="button" accessibilityLabel="Close camera" onPress={onClose} style={styles.topButton}>
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
              <Text style={styles.topTitle}>{t('camera.title')}</Text>
              <View style={styles.topButtonSpacer} />
            </View>
            <View style={styles.guide}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <Text style={styles.hint}>{t('camera.frameHint')}</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.controlBar}>
              <View style={styles.sideSlot}>
                <Pressable accessibilityRole="button" accessibilityLabel="Choose from gallery" onPress={onChooseGallery} style={({ pressed }) => [styles.sideButton, pressed && styles.sideButtonPressed]}>
                  <Ionicons name="image" size={27} color={CONTROL_GREEN} />
                </Pressable>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Take photo" disabled={!cameraReady || capturing} onPress={capture} style={[styles.shutterOuter, (!cameraReady || capturing) && styles.shutterDisabled]}>
                {capturing || !cameraReady ? <ActivityIndicator color={CONTROL_GREEN} /> : <View style={styles.shutterInner} />}
              </Pressable>
              <View style={[styles.sideSlot, styles.rightSlot]}>
                <Pressable accessibilityRole="button" accessibilityLabel={flashOn ? 'Turn flashlight off' : 'Turn flashlight on'} accessibilityState={{ selected: flashOn }} onPress={() => setFlashOn((value) => !value)} style={({ pressed }) => [styles.sideButton, flashOn && styles.sideButtonActive, pressed && styles.sideButtonPressed]}>
                  <Ionicons name={flashOn ? 'flashlight' : 'flashlight-outline'} size={28} color={CONTROL_GREEN} />
                </Pressable>
              </View>
            </View>
          </CameraView>
        ) : (
          <View style={styles.permission}>
            {permission?.canAskAgain === false ? (
              <>
                <Ionicons name="camera-outline" size={40} color="#cfe0d8" />
                <Text style={styles.permissionTitle}>{t('camera.permissionTitle')}</Text>
                <Text style={styles.permissionText}>{t('camera.permissionText')}</Text>
              </>
            ) : (
              <>
                <ActivityIndicator color="#d8ef78" />
                <Text style={styles.permissionTitle}>{t('camera.requesting')}</Text>
              </>
            )}
            <Pressable accessibilityRole="button" onPress={requestPermission} style={styles.allowButton}><Text style={styles.allowText}>{t('camera.allow')}</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Choose from gallery" onPress={onChooseGallery} style={styles.galleryFallback}><Ionicons name="image-outline" size={20} color="#d8ef78" /><Text style={styles.galleryFallbackText}>{t('scan.gallery')}</Text></Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1812' },
  camera: { flex: 1 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 44, paddingBottom: 12 },
  topTitle: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  topButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(22,35,31,0.64)', alignItems: 'center', justifyContent: 'center' },
  topButtonSpacer: { width: 42, height: 42 },
  guide: { position: 'absolute', top: 0, left: 24, right: 24, bottom: 128, justifyContent: 'center', alignItems: 'center' },
  corner: { position: 'absolute', width: 64, height: 64, borderColor: '#fff' },
  cornerTL: { top: 72, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 24 },
  cornerTR: { top: 72, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 24 },
  cornerBL: { bottom: 72, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 24 },
  cornerBR: { bottom: 72, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 24 },
  hint: { position: 'absolute', bottom: 154, left: 24, right: 24, textAlign: 'center', color: '#fff', fontSize: 17, fontWeight: '700', backgroundColor: 'rgba(22,35,31,0.68)', borderRadius: 30, paddingHorizontal: 18, paddingVertical: 8, overflow: 'hidden' },
  error: { position: 'absolute', bottom: 202, left: 24, right: 24, color: '#ffb4ae', backgroundColor: 'rgba(120,20,16,0.72)', fontSize: 13, textAlign: 'center', borderRadius: 12, padding: 10, overflow: 'hidden' },
  controlBar: { position: 'absolute', bottom: 0, left: 0, right: 0, minHeight: 128, paddingHorizontal: 26, paddingTop: 14, paddingBottom: 28, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8faf4', borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  sideSlot: { flex: 1, alignItems: 'flex-start' },
  rightSlot: { alignItems: 'flex-end' },
  sideButton: { width: 54, height: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  sideButtonActive: { backgroundColor: '#e1eedb' },
  sideButtonPressed: { opacity: 0.6 },
  shutterOuter: { width: 78, height: 78, borderRadius: 39, borderWidth: 2, borderColor: '#9dbd8e', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#397f31' },
  shutterDisabled: { opacity: 0.6 },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 36 },
  permissionTitle: { color: '#eaf3ee', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  permissionText: { color: '#a9bfb4', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  allowButton: { marginTop: 10, backgroundColor: '#d8ef78', borderRadius: 999, paddingHorizontal: 22, paddingVertical: 12 },
  allowText: { color: '#174d3a', fontWeight: '800' },
  galleryFallback: { marginTop: 8, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  galleryFallbackText: { color: '#d8ef78', fontSize: 15, fontWeight: '700' },
});
