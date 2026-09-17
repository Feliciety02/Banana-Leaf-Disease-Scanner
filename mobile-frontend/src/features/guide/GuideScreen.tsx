import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CLASS_DISPLAY_NAMES, CLASS_KEYS } from '../classification/disease-data';
import { getTreatmentGuide } from '../classification/treatment-data';
import type { ClassKey } from '../classification/types';
import { palette } from '../connected/ui';

const GUIDE_SUMMARIES: Record<ClassKey, string> = {
  healthy: 'A healthy banana leaf — no disease patterns found. Keep up regular care and monitoring.',
  sigatoka: 'Yellowish streaks and dark blotches that spread across the leaf.',
  'panama-disease': 'Yellowing from the leaf edges, wilting older leaves, and a broken reddish stem inside the trunk.',
  'cordana-leaf-spot': 'Brown oval spots with pale halos that join together near the leaf edge.',
};

export function GuideScreen() {
  const [selected, setSelected] = useState<ClassKey | null>(null);
  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>Guide</Text>
      <Text style={styles.subtitle}>Look up a banana leaf symptom, recommended medication, and care tips.</Text>

      {CLASS_KEYS.map((classKey) => {
        const open = selected === classKey;
        const guide = getTreatmentGuide(classKey);
        return (
          <View key={classKey} style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setSelected(open ? null : classKey)} style={styles.cardHeader}>
              {guide.leafImage ? <Image source={guide.leafImage} style={styles.thumb} resizeMode="cover" accessibilityLabel={`Example of ${CLASS_DISPLAY_NAMES[classKey]}`} /> : <View style={styles.thumbPlaceholder}><Ionicons name="leaf-outline" size={22} color={palette.green} /></View>}
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{CLASS_DISPLAY_NAMES[classKey]}</Text>
                <Text style={styles.cardSummary} numberOfLines={open ? undefined : 2}>{GUIDE_SUMMARIES[classKey]}</Text>
              </View>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={palette.green} />
            </Pressable>

            {open && (
              <View style={styles.detail}>
                {classKey === 'healthy' ? (
                  <View style={styles.healthyCard}>
                    <Ionicons name="checkmark-circle" size={20} color={palette.success} />
                    <Text style={styles.healthyText}>No treatment needed. Continue with regular care and monitoring.</Text>
                  </View>
                ) : null}

                {guide.products.length > 0 && (
                  <View style={styles.group}>
                    <Text style={styles.subLabel}>Recommended medication</Text>
                    {guide.products.map((product, index) => (
                      <View key={product.name} style={styles.productRow}>
                        <View style={styles.stepBadge}><Text style={styles.stepText}>{index + 1}</Text></View>
                        {product.image ? <Image source={product.image} style={styles.productImage} resizeMode="cover" accessibilityLabel={`${product.name} product`} /> : null}
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
                  <View style={styles.group}>
                    <Text style={styles.subLabel}>Care tips</Text>
                    {guide.tips.map((tip) => (
                      <View key={tip} style={styles.tipRow}>
                        <Ionicons name="checkmark-circle" size={16} color={palette.green} />
                        <Text style={styles.tipText}>{tip}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 12, paddingTop: 14, paddingBottom: 24 },
  heading: { color: palette.ink, fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: '#6c7d77', fontSize: 16, lineHeight: 23, fontWeight: '500', marginTop: -6 },
  card: { borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', overflow: 'hidden' },
  cardHeader: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
  thumb: { width: 58, height: 58, borderRadius: 12, backgroundColor: '#0b3328' },
  thumbPlaceholder: { width: 58, height: 58, borderRadius: 12, backgroundColor: '#edf3ee', alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1, gap: 2 },
  cardTitle: { color: palette.ink, fontSize: 16, fontWeight: '900' },
  cardSummary: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  detail: { gap: 13, borderTopWidth: 1, borderTopColor: palette.border, padding: 14, backgroundColor: '#fbfcfb' },
  healthyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, backgroundColor: palette.successSoft, borderWidth: 1, borderColor: '#bddfce', padding: 12 },
  healthyText: { flex: 1, color: palette.success, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  group: { gap: 8 },
  subLabel: { color: palette.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 13, backgroundColor: '#f7f9f8', borderWidth: 1, borderColor: palette.border },
  stepBadge: { width: 24, height: 24, borderRadius: 999, backgroundColor: palette.green, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  productImage: { width: 64, height: 64, borderRadius: 11, backgroundColor: '#eef5ef' },
  productCopy: { flex: 1, gap: 2 },
  productName: { color: palette.ink, fontSize: 15, fontWeight: '900' },
  productDescription: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  productPrice: { color: palette.green, fontSize: 15, fontWeight: '900', marginTop: 2 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  tipText: { flex: 1, color: palette.ink, fontSize: 13, lineHeight: 19 },
});