import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { palette } from '../connected/ui';
import { ViewableImage } from '../../components/ViewableImage';
import { useT } from '../../i18n';

export function SelectedImagePreview({ uri }: { uri: string | null }) {
  const { t } = useT();
  if (!uri) {
    return (
      <View accessibilityLabel={t('scan.noPhoto')} style={styles.frame}>
        <Ionicons name="image-outline" size={40} color="#a7b4ad" />
        <Text style={styles.title}>{t('scan.noPhoto')}</Text>
        <Text style={styles.subtitle}>{t('scan.noPhotoHint')}</Text>
      </View>
    );
  }
  return (
    <View style={styles.frame}>
      <ViewableImage source={{ uri }} title="Selected photo" style={styles.image} containerStyle={styles.image} />
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