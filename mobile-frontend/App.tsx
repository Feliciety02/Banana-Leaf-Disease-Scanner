import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';

import { CLASS_DISPLAY_NAMES, getDisease } from './src/data';
import { analyzeLeaf, InferenceResult } from './src/services/inference';

const colors = { background: '#f4f7f2', card: '#fff', green: '#174d3a', lime: '#d8ef78', ink: '#17231f', muted: '#5e6d67', border: '#dce5df', warning: '#785b17' };

export default function App() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [loading, setLoading] = useState(false);

  const chooseImage = async (camera: boolean) => {
    setResult(null);
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera permission required', 'Allow camera access to photograph a banana leaf.');
        return;
      }
    }
    const picker = camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const selection = await picker({ mediaTypes: ['images'], allowsEditing: false, quality: 1, cameraType: ImagePicker.CameraType.back });
    if (!selection.canceled) setImageUri(selection.assets[0].uri);
  };

  const classify = async () => {
    if (!imageUri || loading) return;
    setLoading(true);
    try {
      setResult(await analyzeLeaf(imageUri));
    } catch (error) {
      Alert.alert('On-device model unavailable', error instanceof Error ? error.message : 'The validated INT8 model could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const disease = result ? getDisease(result.classKey) : null;
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}><View style={styles.logo}><Ionicons name="leaf" size={24} color={colors.green} /></View><View><Text style={styles.brand}>DahonMD</Text><Text style={styles.kicker}>BANANA LEAF CLASSIFICATION</Text></View></View>
        <View style={styles.hero}><Text style={styles.heroTitle}>Check visible leaf patterns</Text><Text style={styles.heroText}>Classification runs locally on the device. No account, Internet connection, upload, or scan history is required.</Text></View>
        <View style={styles.card}>
          {imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" /> : <View style={styles.placeholder}><Ionicons name="image-outline" size={48} color={colors.green} /><Text style={styles.placeholderTitle}>One banana leaf per image</Text><Text style={styles.placeholderText}>Use good lighting and keep spots, streaks, or discoloration visible.</Text></View>}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={() => chooseImage(true)}><Ionicons name="camera" size={19} color="#fff" /><Text style={styles.primaryText}>Take photo</Text></Pressable>
            <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => chooseImage(false)}><Ionicons name="images-outline" size={19} color={colors.green} /><Text style={styles.secondaryText}>Choose image</Text></Pressable>
          </View>
          {imageUri && <Pressable accessibilityRole="button" style={[styles.analyzeButton, loading && styles.disabled]} disabled={loading} onPress={classify}>{loading ? <ActivityIndicator color={colors.ink} /> : <Ionicons name="scan" size={20} color={colors.ink} />}<Text style={styles.analyzeText}>{loading ? 'Classifying…' : 'Classify on device'}</Text></Pressable>}
        </View>
        {result && disease && <View style={styles.resultCard}><Text style={styles.kicker}>MODEL OUTPUT</Text><Text style={styles.resultClass}>{CLASS_DISPLAY_NAMES[result.classKey]}</Text><Text style={styles.confidence}>Model confidence: {(result.confidence * 100).toFixed(1)}%</Text><Text style={styles.note}>This is relative output confidence, not guaranteed disease probability or diagnostic certainty.</Text><View style={styles.divider} /><Text style={styles.body}>{disease.summary}</Text>{result.classKey === 'panama-disease' && <Text style={styles.warning}>This output means visible leaf-image patterns associated with Panama Disease. It is not laboratory confirmation of Fusarium or confirmed Foc infection.</Text>}</View>}
        <View style={styles.scopeCard}><Text style={styles.scopeTitle}>Validated scope</Text><Text style={styles.body}>Healthy · Sigatoka · Panama Disease · Cordana Leaf Spot</Text><Text style={styles.note}>Results may be unreliable for non-leaf images, other crops, unknown diseases, Moko disease, severe blur, or obscured leaves. No “unknown” model class is implied.</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background }, page: { padding: 20, paddingBottom: 42, gap: 18 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, logo: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }, brand: { color: colors.ink, fontSize: 23, fontWeight: '800' }, kicker: { color: colors.green, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }, hero: { backgroundColor: colors.green, borderRadius: 24, padding: 22, gap: 9 }, heroTitle: { color: '#fff', fontSize: 28, lineHeight: 34, fontWeight: '800' }, heroText: { color: '#dce9e3', fontSize: 15, lineHeight: 22 }, card: { backgroundColor: colors.card, borderRadius: 24, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 14 }, preview: { width: '100%', aspectRatio: 1, borderRadius: 17, backgroundColor: '#e6ece8' }, placeholder: { aspectRatio: 1, borderRadius: 17, backgroundColor: '#eef3ef', alignItems: 'center', justifyContent: 'center', padding: 30, gap: 10 }, placeholderTitle: { color: colors.ink, fontSize: 18, fontWeight: '700', textAlign: 'center' }, placeholderText: { color: colors.muted, lineHeight: 21, textAlign: 'center' }, actions: { flexDirection: 'row', gap: 10 }, primaryButton: { flex: 1, minHeight: 50, borderRadius: 14, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, secondaryButton: { flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, primaryText: { color: '#fff', fontWeight: '700' }, secondaryText: { color: colors.green, fontWeight: '700' }, analyzeButton: { minHeight: 52, borderRadius: 14, backgroundColor: colors.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, analyzeText: { color: colors.ink, fontWeight: '800' }, disabled: { opacity: 0.65 }, resultCard: { backgroundColor: colors.card, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 9 }, resultClass: { color: colors.ink, fontSize: 29, fontWeight: '800' }, confidence: { color: colors.green, fontSize: 17, fontWeight: '700' }, divider: { height: 1, backgroundColor: colors.border, marginVertical: 5 }, body: { color: colors.ink, fontSize: 15, lineHeight: 22 }, note: { color: colors.muted, fontSize: 13, lineHeight: 19 }, warning: { color: colors.warning, backgroundColor: '#fff6d9', borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 19 }, scopeCard: { borderRadius: 18, padding: 17, backgroundColor: '#e8efe9', gap: 7 }, scopeTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
});
