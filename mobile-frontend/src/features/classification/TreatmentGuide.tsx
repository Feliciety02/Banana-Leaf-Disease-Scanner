import { Image, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ClassKey } from './types';
import { getTreatmentGuide } from './treatment-data';

const colors = { card: '#fff', green: '#174d3a', ink: '#17231f', muted: '#5e6d67', border: '#dce5df', success: '#1f6a4d', successSoft: '#e6f4ed' };

export function TreatmentGuide({ classKey }: { classKey: ClassKey }) {
  const guide = getTreatmentGuide(classKey);
  const isHealthy = classKey === 'healthy';
  return (
    <View style={styles.section}>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>WHAT TO DO</Text>
          <Text style={styles.heading}>{guide.heading}</Text>
          <Text style={styles.basedOn}>Based on the Enhanced model</Text>
        </View>
        {guide.leafImage ? <Image source={guide.leafImage} style={styles.leafImage} resizeMode="cover" accessibilityLabel={`Example of ${classKey}`} /> : null}
      </View>

      {isHealthy ? (
        <View style={styles.healthyCard}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <View style={styles.healthyCopy}>
            <Text style={styles.healthyTitle}>Healthy Plant</Text>
            <Text style={styles.healthyText}>No treatment needed. Continue with regular care and monitoring.</Text>
          </View>
        </View>
      ) : null}

      {guide.products.length > 0 && (
        <View style={styles.products}>
          <Text style={styles.subLabel}>Recommended medication</Text>
          {guide.products.map((product, index) => (
            <View key={product.name} style={styles.productRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepText}>{index + 1}</Text>
              </View>
              {product.image ? <Image source={product.image} style={styles.productImage} resizeMode="cover" accessibilityLabel={`${product.name} product`} /> : <View style={styles.productImagePlaceholder}><Ionicons name="flask-outline" size={24} color={colors.green} /></View>}
              <View style={styles.productCopy}>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.productDescription}>{product.description}</Text>
                <Text style={styles.productPrice}>{product.price}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {guide.tips.length > 0 && (
        <View style={styles.tips}>
          <Text style={styles.subLabel}>Care tips</Text>
          {guide.tips.map((tip) => (
            <View key={tip} style={styles.tipRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.green} />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 11, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroCopy: { flex: 1, gap: 3 },
  eyebrow: { color: colors.green, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  heading: { color: colors.ink, fontSize: 20, lineHeight: 26, fontWeight: '900' },
  basedOn: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  leafImage: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#0b3328' },
  healthyCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 13, backgroundColor: colors.successSoft, borderWidth: 1, borderColor: '#bddfce', padding: 13 },
  healthyCopy: { flex: 1, gap: 2 },
  healthyTitle: { color: colors.success, fontSize: 15, fontWeight: '800' },
  healthyText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  products: { gap: 9 },
  subLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 13, backgroundColor: '#f7f9f8', borderWidth: 1, borderColor: colors.border },
  stepBadge: { width: 24, height: 24, borderRadius: 999, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  productImage: { width: 64, height: 64, borderRadius: 11, backgroundColor: '#eef5ef' },
  productImagePlaceholder: { width: 64, height: 64, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef5ef' },
  productCopy: { flex: 1, gap: 2 },
  productName: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  productDescription: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  productPrice: { color: colors.green, fontSize: 15, fontWeight: '900', marginTop: 2 },
  tips: { gap: 8 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  tipText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 19 },
});