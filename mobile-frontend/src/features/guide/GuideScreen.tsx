import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CLASS_KEYS } from '../classification/disease-data';
import { getTreatmentGuide } from '../classification/treatment-data';
import { TreatmentGuide } from '../classification/TreatmentGuide';
import type { ClassKey } from '../classification/types';
import { palette } from '../connected/ui';
import { ViewableImage } from '../../components/ViewableImage';
import { className, guideSummary } from '../../i18n/content';
import { useT } from '../../i18n';
import { LibraryScreen } from '../library/LibraryScreen';
import { bundledArticles } from '../../services/articleLibrary';
import { extraLeafConditions } from './extraLeafConditions';

export function GuideScreen({ initialClass = null, onScrollTop }: { initialClass?: ClassKey | null; onScrollTop?: () => void }) {
  const [selected, setSelected] = useState<ClassKey | null>(initialClass);
  const [selectedExtra, setSelectedExtra] = useState<string | null>(null);
  const [view, setView] = useState<{ name: 'conditions' } | { name: 'library'; disease: ClassKey | 'all' }>({ name: 'conditions' });
  const { t, language } = useT();
  // Counts come from the bundled library; the library screen itself shows the latest saved copy.
  const articleCounts = useMemo(() => bundledArticles().reduce<Record<string, number>>((counts, article) => {
    if (article.disease_key) counts[article.disease_key] = (counts[article.disease_key] ?? 0) + 1;
    return counts;
  }, {}), []);
  const openLibrary = (disease: ClassKey | 'all') => { setView({ name: 'library', disease }); onScrollTop?.(); };
  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>{t('guide.heading')}</Text>
      <View style={styles.segments} accessibilityRole="tablist">
        {(['conditions', 'library'] as const).map((name) => {
          const active = view.name === name;
          return (
            <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => (name === 'library' ? openLibrary('all') : setView({ name }))} style={[styles.segment, active && styles.segmentActive]}>
              <Ionicons name={name === 'library' ? 'library-outline' : 'leaf-outline'} size={16} color={active ? '#fff' : palette.green} />
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{name === 'library' ? t('guide.libraryTab') : t('guide.conditionsTab')}</Text>
            </Pressable>
          );
        })}
      </View>
      {view.name === 'library' ? <LibraryScreen key={view.disease} initialDisease={view.disease} onScrollTop={onScrollTop} /> : <>
      <Text style={styles.subtitle}>{t('guide.subtitle')}</Text>

      {CLASS_KEYS.map((classKey) => {
        const open = selected === classKey;
        const guide = getTreatmentGuide(classKey);
        return (
          <View key={classKey} style={styles.card}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => { setSelected(open ? null : classKey); setSelectedExtra(null); }} style={styles.cardHeader}>
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
                {(articleCounts[classKey] ?? 0) > 0 && <Pressable accessibilityRole="button" onPress={() => openLibrary(classKey)} style={styles.libraryLink}>
                  <Ionicons name="library-outline" size={18} color={palette.green} />
                  <Text style={styles.libraryLinkText}>{t('library.forClass', { count: articleCounts[classKey] ?? 0 })}</Text>
                  <Ionicons name="chevron-forward" size={16} color={palette.green} />
                </Pressable>}
              </View>
            )}
          </View>
        );
      })}
      {extraLeafConditions.map((condition) => {
        const copy = condition.text[language];
        const open = selectedExtra === condition.id;
        return <View key={condition.id} style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => { setSelected(null); setSelectedExtra(open ? null : condition.id); }} style={styles.cardHeader}>
            <ViewableImage source={condition.image} title={copy.name} style={styles.thumb} />
            <View style={styles.cardCopy}><Text style={styles.cardTitle}>{copy.name}</Text><Text style={styles.cardSummary} numberOfLines={open ? undefined : 2}>{copy.summary}</Text>{!open && <Text style={styles.cardHint}>{t('guide.seeTreatment')}</Text>}<Text style={styles.guideOnly}>{t('guide.only')}</Text></View>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={palette.green} />
          </Pressable>
          {open && <View style={styles.detail}>
            <View style={styles.group}>
              <Text style={styles.subLabel}>{t('guide.spot')}</Text>
              <Text style={styles.bodyText}>{copy.summary}</Text>
            </View>
            <Text style={styles.subLabel}>{t('guide.treatment')}</Text>
            <TreatmentGuide showHeader={false} content={{
              heading: copy.name,
              leafImage: condition.image,
              tips: copy.steps,
              products: condition.product ? [{ name: condition.product.name, description: condition.product.description[language], sourceUrl: condition.product.sourceUrl }] : [],
            }} />
            <Text style={styles.guideNote}>{copy.note}</Text>
            <Text style={styles.photoCredit}>{condition.imageSource}</Text>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(condition.sourceUrl)}><Text style={styles.sourceLink}>{t('guide.readDiseaseGuidance')}</Text></Pressable>
          </View>}
        </View>;
      })}
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 12, paddingTop: 14, paddingBottom: 24 },
  heading: { color: palette.ink, fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 20, marginBottom: 2 },
  segments: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 14, backgroundColor: palette.greenSoft },
  segment: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 11 },
  segmentActive: { backgroundColor: palette.green },
  segmentText: { color: palette.green, fontSize: 14, fontWeight: '800' },
  segmentTextActive: { color: '#fff' },
  libraryLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', paddingHorizontal: 12 },
  libraryLinkText: { flex: 1, color: palette.green, fontSize: 14, fontWeight: '800' },
  card: { borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', overflow: 'hidden' },
  cardHeader: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
  thumb: { width: 60, height: 60, borderRadius: 9, backgroundColor: '#edf1ee' },
  thumbPlaceholder: { width: 60, height: 60, borderRadius: 9, backgroundColor: '#edf1ee', alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1, gap: 2 },
  cardTitle: { color: '#21382b', fontSize: 16, fontWeight: '800' },
  cardSummary: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  cardHint: { color: palette.green, fontSize: 12, fontWeight: '800', marginTop: 2 },
  guideOnly: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  detail: { gap: 12, borderTopWidth: 1, borderTopColor: palette.border, padding: 14, backgroundColor: '#f6f9f7' },
  group: { gap: 6 },
  subLabel: { color: '#22372c', fontSize: 16, fontWeight: '800' },
  bodyText: { color: '#3c4c43', fontSize: 14, lineHeight: 20 },
  photoCredit: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  guideNote: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  sourceLink: { color: palette.green, fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
});
