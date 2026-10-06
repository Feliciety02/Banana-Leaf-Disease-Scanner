import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { useT } from '../../i18n';
import { serverUrlFromConnectionQr } from '../../services/api';

export function ConnectionQrScanner({ visible, onClose, onSettings, onConnect }: {
  visible: boolean;
  onClose: () => void;
  onSettings: () => void;
  onConnect: (server: string) => Promise<void>;
}) {
  const { t } = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');

  const scan = async (data: string) => {
    if (busyRef.current) return;
    const server = serverUrlFromConnectionQr(data);
    if (!server) { setError(t('connection.invalidQr')); return; }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await onConnect(server);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('connection.scanFailed'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => { void scan(data); }}>
            <View style={styles.topBar}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('connection.closeScanner')} onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
              <Text style={styles.title}>{t('connection.scanTitle')}</Text>
            </View>
            <View style={styles.instructions}>
              {busy && <ActivityIndicator color="#d8ef78" />}
              <Text style={styles.help}>{busy ? t('connection.connecting') : t('connection.scanHint')}</Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {!busy && <Pressable accessibilityRole="button" onPress={onSettings} style={styles.settingsButton}><Text style={styles.settingsText}>{t('connection.enterAddress')}</Text></Pressable>}
            </View>
          </CameraView>
        ) : (
          <View style={styles.permission}>
            <Ionicons name="qr-code-outline" size={48} color="#d8ef78" />
            <Text style={styles.title}>{t('connection.scanTitle')}</Text>
            <Text style={styles.help}>{t('connection.cameraPermission')}</Text>
            {permission?.canAskAgain !== false && <Pressable accessibilityRole="button" onPress={() => { void requestPermission(); }} style={styles.allowButton}><Text style={styles.allowText}>{t('connection.allowCamera')}</Text></Pressable>}
            <Pressable accessibilityRole="button" onPress={onSettings} style={styles.closeFallback}><Text style={styles.closeText}>{t('connection.enterAddress')}</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeFallback}><Text style={styles.closeText}>{t('connection.closeScanner')}</Text></Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1812' },
  camera: { flex: 1 },
  topBar: { position: 'absolute', top: 44, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  closeButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(22,35,31,0.75)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  instructions: { position: 'absolute', bottom: 50, left: 20, right: 20, alignItems: 'center', gap: 10, padding: 18, borderRadius: 16, backgroundColor: 'rgba(22,35,31,0.85)' },
  help: { color: '#fff', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  error: { color: '#ffb4ae', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  settingsButton: { paddingHorizontal: 16, paddingVertical: 10 },
  settingsText: { color: '#d8ef78', fontSize: 14, fontWeight: '700' },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 32 },
  allowButton: { paddingHorizontal: 22, paddingVertical: 13, borderRadius: 999, backgroundColor: '#d8ef78' },
  allowText: { color: '#174d3a', fontWeight: '800' },
  closeFallback: { padding: 12 },
  closeText: { color: '#d8ef78', fontWeight: '700' },
});
