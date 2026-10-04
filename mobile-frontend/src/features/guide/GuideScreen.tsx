import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CLASS_KEYS } from '../classification/disease-data';
import { getTreatmentGuide } from '../classification/treatment-data';
import { TreatmentGuide } from '../classification/TreatmentGuide';
import type { ClassKey } from '../classification/types';
import { palette } from '../connected/ui';
import { ViewableImage } from '../../components/ViewableImage';
import { className, guideSummary } from '../../i18n/content';
import { useT } from '../../i18n';

export function GuideScreen({ initialClass = null }: { initialClass?: ClassKey | null }) {
  const [selected, setSelected] = useState<ClassKey | null>(initialClass);
  const { t, language } = useT();
  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>{t('guide.heading')}</Text>
      <Text style={styles.subtitle}>{t('guide.subtitle')}</Text>

      {CLASS_KEYS.map((classKey) => {
        const open = selected === classKey;
        const guide = getTreatmentGuide(classKey);
        return (
          <View key={classKey} style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setSelected(open ? null : classKey)} style={styles.cardHeader}>
              {guide.leafImage ? <ViewableImage source={guide.leafImage} title={className(classKey, language)} style={styles.thumb} /> : <View style={styles.thumbPlaceholder}><Ionicons name="leaf-outline" size={22} color={palette.green} /></View>}
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{className(classKey, language)}</Text>
                <Text style={styles.cardSummary} numberOfLines={open ? undefined : 2}>{guideSummary(classKey, language)}</Text>
                {!open && <Text style={styles.cardHint}>{classKey === 'healthy' ? t('guide.seeCare') : t('guide.seeTreatment')}</Text>}
              </View>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={palette.green} />
            </Pressable>

            {open && (
              <View style={styles.detail}>
                <View style={styles.group}>
                  <Text style={styles.subLabel}>{t('guide.spot')}</Text>
                  <Text style={styles.bodyText}>{guideSummary(classKey, language)}</Text>
                </View>
                <Text style={styles.subLabel}>{classKey === 'healthy' ? t('guide.care') : t('guide.treatment')}</Text>
                <TreatmentGuide classKey={classKey} showHeader={false} />
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
  heading: { color: palette.ink, fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: -8, marginBottom: 2 },
  card: { borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', overflow: 'hidden' },
  cardHeader: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
  thumb: { width: 60, height: 60, borderRadius: 9, backgroundColor: '#edf1ee' },
  thumbPlaceholder: { width: 60, height: 60, borderRadius: 9, backgroundColor: '#edf1ee', alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1, gap: 2 },
  cardTitle: { color: '#21382b', fontSize: 16, fontWeight: '800' },
  cardSummary: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  cardHint: { color: palette.green, fontSize: 12, fontWeight: '800', marginTop: 2 },
  detail: { gap: 12, borderTopWidth: 1, borderTopColor: palette.border, padding: 14, backgroundColor: '#f6f9f7' },
  group: { gap: 6 },
  subLabel: { color: '#22372c', fontSize: 16, fontWeight: '800' },
  bodyText: { color: '#3c4c43', fontSize: 14, lineHeight: 20 },
});
