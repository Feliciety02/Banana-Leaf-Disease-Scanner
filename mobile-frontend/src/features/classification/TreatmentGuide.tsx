import { useState } from 'react';
import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ClassKey } from './types';
import { ViewableImage } from '../../components/ViewableImage';
import { localizedTreatment } from '../../i18n/content';
import { useT } from '../../i18n';

const colors = { card: '#fff', green: '#174d3a', ink: '#17231f', muted: '#5e6d67', border: '#dce5df', success: '#1f6a4d', successSoft: '#e6f4ed' };

// Photos smaller than this look blurry when shown on a phone screen, so a drawn
// badge is shown instead. Replacing the file with a clear photo shows it automatically.
const MIN_SHARP_PHOTO_PX = 300;

function isSharpPhoto(source?: ImageSourcePropType) {
  if (!source) return false;
  const asset = Image.resolveAssetSource(source);
  return Boolean(asset && Math.min(asset.width ?? 0, asset.height ?? 0) >= MIN_SHARP_PHOTO_PX);
}

/**
 * Treatment for one class, shared by the scan result and the Guide so both say
 * the same thing. Practical steps come first; research products stay folded.
 */
export function TreatmentGuide({ classKey, showHeader = true }: { classKey: ClassKey; showHeader?: boolean }) {
  const { t, language } = useT();
  const [showProducts, setShowProducts] = useState(false);
  const guide = localizedTreatment(classKey, language);
  const isHealthy = classKey === 'healthy';
  return (
    <View style={[styles.section, !showHeader && styles.embedded]}>
      {showHeader && <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heading}>{guide.heading}</Text>
        </View>
        {guide.leafImage ? <ViewableImage source={guide.leafImage} title={guide.heading} style={styles.leafImage} /> : null}
      </View>}

      {isHealthy ? (
        <View style={styles.healthyCard}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <View style={styles.healthyCopy}>
            <Text style={styles.healthyTitle}>{t('treatment.healthyTitle')}</Text>
            <Text style={styles.healthyText}>{t('treatment.healthyText')}</Text>
          </View>
        </View>
      ) : null}

      {guide.tips.length > 0 && (
        <View style={styles.tips}>
          <Text style={styles.subHeading}>{isHealthy ? t('treatment.keepHealthy') : t('treatment.whatToDo')}</Text>
          {guide.tips.map((tip, index) => {
            const [title, ...rest] = tip.split(': ');
            return (
              <View key={tip} style={styles.tipRow}>
                <View style={styles.tipNumber}><Text style={styles.tipNumberText}>{index + 1}</Text></View>
                <Text style={styles.tipText}>{rest.length ? <><Text style={styles.tipTitle}>{title}. </Text>{rest.join(': ')}</> : tip}</Text>
              </View>
            );
          })}
        </View>
      )}

      {guide.products.length > 0 && (
        <View style={styles.products}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showProducts }} onPress={() => setShowProducts((value) => !value)} style={styles.productsToggle}>
            <Ionicons name="flask-outline" size={18} color={colors.green} />
            <Text style={styles.productsToggleText}>{showProducts ? t('treatment.productsHide') : t('treatment.productsShow')}</Text>
            <Ionicons name={showProducts ? 'chevron-up' : 'chevron-down'} size={18} color={colors.green} />
          </Pressable>
          {showProducts && <>
            <View style={styles.notice}>
              <Ionicons name="warning-outline" size={17} color="#76591e" />
              <Text style={styles.noticeText}>{t('treatment.safety')}</Text>
            </View>
            {guide.products.map((product) => (
              <View key={product.name} style={styles.productRow}>
                {isSharpPhoto(product.image)
                  ? <ViewableImage source={product.image} title={product.name} style={styles.productImage} />
                  : <View style={styles.productImagePlaceholder} accessibilityLabel={product.name}><Ionicons name="flask" size={26} color={colors.green} /></View>}
                <View style={styles.productCopy}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productDescription}>{product.description}</Text>
                  <Text style={styles.productPrice}>{product.price}</Text>
                </View>
              </View>
            ))}
          </>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  embedded: { padding: 0, borderWidth: 0, backgroundColor: 'transparent' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroCopy: { flex: 1, gap: 3 },
  heading: { color: colors.ink, fontSize: 20, lineHeight: 26, fontWeight: '900' },
  leafImage: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#0b3328' },
  healthyCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 13, backgroundColor: colors.successSoft, borderWidth: 1, borderColor: '#bddfce', padding: 13 },
  healthyCopy: { flex: 1, gap: 2 },
  healthyTitle: { color: colors.success, fontSize: 15, fontWeight: '800' },
  healthyText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  tips: { gap: 10 },
  subHeading: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tipNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  tipNumberText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  tipText: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 21 },
  tipTitle: { fontWeight: '800' },
  products: { gap: 9 },
  productsToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  productsToggleText: { flex: 1, color: colors.green, fontSize: 14, fontWeight: '800' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, backgroundColor: '#fff6e5', borderWidth: 1, borderColor: '#e6d09e', padding: 11 },
  noticeText: { flex: 1, color: '#76591e', fontSize: 12, lineHeight: 18 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 13, backgroundColor: '#f7f9f8', borderWidth: 1, borderColor: colors.border },
  productImage: { width: 64, height: 64, borderRadius: 11, backgroundColor: '#eef5ef' },
  productImagePlaceholder: { width: 64, height: 64, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f0e7', borderWidth: 1, borderColor: '#c9dfcf' },
  productCopy: { flex: 1, gap: 2 },
  productName: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  productDescription: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  productPrice: { color: colors.green, fontSize: 15, fontWeight: '900', marginTop: 2 },
});
