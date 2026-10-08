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
      <View style={styles.intro}>
        <View style={styles.introIcon}><Ionicons name="search-outline" size={24} color={palette.green} /></View>
        <View style={styles.introCopy}>
          <Text style={styles.introTitle}>{t('guide.compareTitle')}</Text>
          <Text style={styles.subtitle}>{t('guide.subtitle')}</Text>
        </View>
      </View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('guide.scanChecks')}</Text>
        <Text style={styles.sectionCount}>{CLASS_KEYS.length}</Text>
      </View>

      {CLASS_KEYS.map((classKey) => {
        const open = selected === classKey;
        const guide = getTreatmentGuide(classKey);
        return (
          <View key={classKey} style={[styles.card, open && styles.cardOpen]}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => { setSelected(open ? null : classKey); setSelectedExtra(null); }} style={styles.cardHeader}>
              {guide.leafImage ? <ViewableImage source={guide.leafImage} title={className(classKey, language)} style={styles.thumb} /> : <View style={styles.thumbPlaceholder}><Ionicons name="leaf-outline" size={22} color={palette.green} /></View>}
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{className(classKey, language)}</Text>
                {!open && <Text style={styles.cardSummary} numberOfLines={2}>{guideSummary(classKey, language)}</Text>}
                <Text style={styles.cardHint}>{open ? t('guide.hideDetails') : t('guide.seeSteps')}</Text>
              </View>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={palette.green} />
            </Pressable>

            {open && (
              <View style={styles.detail}>
                <View style={styles.group}>
                  <Text style={styles.subLabel}>{t('guide.spot')}</Text>
                  <Text style={styles.bodyText}>{guideSummary(classKey, language)}</Text>
                </View>
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
      <View style={styles.otherSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('guide.otherConditions')}</Text>
          <Text style={styles.sectionCount}>{extraLeafConditions.length}</Text>
        </View>
        <Text style={styles.otherHint}>{t('guide.otherHint')}</Text>
      </View>
      {extraLeafConditions.map((condition) => {
        const copy = condition.text[language];
        const open = selectedExtra === condition.id;
        return <View key={condition.id} style={[styles.card, open && styles.cardOpen]}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => { setSelected(null); setSelectedExtra(open ? null : condition.id); }} style={styles.cardHeader}>
            <ViewableImage source={condition.image} title={copy.name} style={styles.thumb} />
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle}>{copy.name}</Text>
              <Text style={styles.guideOnly}>{t('guide.notScanned')}</Text>
              {!open && <Text style={styles.cardSummary} numberOfLines={2}>{copy.summary}</Text>}
              <Text style={styles.cardHint}>{open ? t('guide.hideDetails') : t('guide.seeSteps')}</Text>
            </View>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={palette.green} />
          </Pressable>
          {open && <View style={styles.detail}>
            <View style={styles.group}>
              <Text style={styles.subLabel}>{t('guide.spot')}</Text>
              <Text style={styles.bodyText}>{copy.summary}</Text>
            </View>
            <TreatmentGuide showHeader={false} content={{
              heading: copy.name,
              leafImage: condition.image,
              tips: copy.steps,
              products: condition.product ? [{ name: condition.product.name, description: condition.product.description[language], sourceUrl: condition.product.sourceUrl }] : [],
            }} />
            <View style={styles.guideNoteBox}><Ionicons name="information-circle-outline" size={20} color="#87561b" /><Text style={styles.guideNote}>{copy.note}</Text></View>
            <Text style={styles.photoCredit}>{condition.imageSource}</Text>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(condition.sourceUrl)} style={styles.sourceButton}><Ionicons name="open-outline" size={17} color={palette.green} /><Text style={styles.sourceLink}>{t('guide.readDiseaseGuidance')}</Text></Pressable>
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
  intro: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#cfe5d6', backgroundColor: '#edf7ef' },
  introIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#d9eddf' },
  introCopy: { flex: 1, gap: 4 },
  introTitle: { color: '#113e31', fontSize: 18, lineHeight: 24, fontWeight: '800' },
  subtitle: { color: '#436052', fontSize: 14, lineHeight: 21 },
  segments: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 14, backgroundColor: palette.greenSoft },
  segment: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 11 },
  segmentActive: { backgroundColor: palette.green },
  segmentText: { color: palette.green, fontSize: 14, fontWeight: '800' },
  segmentTextActive: { color: '#fff' },
  libraryLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', paddingHorizontal: 12 },
  libraryLinkText: { flex: 1, color: palette.green, fontSize: 14, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 8 },
  sectionTitle: { flex: 1, color: '#183e30', fontSize: 19, lineHeight: 25, fontWeight: '800' },
  sectionCount: { minWidth: 28, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: '#e2f0e6', color: palette.green, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  otherSection: { gap: 4, marginTop: 12 },
  otherHint: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  card: { borderRadius: 18, borderWidth: 1, borderColor: '#dce8df', backgroundColor: '#fff', overflow: 'hidden' },
  cardOpen: { borderColor: '#a9d2b7' },
  cardHeader: { minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13 },
  thumb: { width: 82, height: 82, borderRadius: 13, backgroundColor: '#edf1ee' },
  thumbPlaceholder: { width: 82, height: 82, borderRadius: 13, backgroundColor: '#edf1ee', alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1, gap: 5 },
  cardTitle: { color: '#173a2b', fontSize: 17, lineHeight: 22, fontWeight: '800' },
  cardSummary: { color: '#54645a', fontSize: 14, lineHeight: 20 },
  cardHint: { color: palette.green, fontSize: 14, fontWeight: '800', marginTop: 1 },
  guideOnly: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', backgroundColor: '#fff1dc', color: '#88551c', fontSize: 11, fontWeight: '800' },
  detail: { gap: 15, borderTopWidth: 1, borderTopColor: '#dce8df', padding: 16, backgroundColor: '#f8fbf8' },
  group: { gap: 6 },
  subLabel: { color: '#22372c', fontSize: 16, fontWeight: '800' },
  bodyText: { color: '#3c4c43', fontSize: 15, lineHeight: 22 },
  photoCredit: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  guideNoteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#fff4e3' },
  guideNote: { flex: 1, color: '#715024', fontSize: 13, lineHeight: 19 },
  sourceButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourceLink: { color: palette.green, fontSize: 14, fontWeight: '800' },
});
