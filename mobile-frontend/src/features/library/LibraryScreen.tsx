import { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ImageSourcePropType } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CLASS_KEYS } from '../classification/disease-data';
import type { ClassKey } from '../classification/types';
import { palette } from '../connected/ui';
import { className } from '../../i18n/content';
import { useT, type Language, type StringKey } from '../../i18n';
import { ViewableImage } from '../../components/ViewableImage';
import { ARTICLE_TOPICS, articleImageSource, imageLineFile, loadSavedLibrary, refreshLibrary, searchArticles, type ArticleImage, type ArticleTopic, type LibraryArticle, type LibraryFilter, type LibrarySnapshot } from '../../services/articleLibrary';

type DiseaseFilter = LibraryFilter['diseaseKey'];

function diseaseLabel(key: string | null, language: Language, general: string) {
  return key && (CLASS_KEYS as readonly string[]).includes(key) ? className(key as ClassKey, language) : general;
}

export function LibraryScreen({ initialDisease = 'all', onScrollTop }: { initialDisease?: DiseaseFilter; onScrollTop?: () => void }) {
  const { t, language } = useT();
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const [query, setQuery] = useState('');
  const [diseaseKey, setDiseaseKey] = useState<DiseaseFilter>(initialDisease);
  const [topic, setTopic] = useState<ArticleTopic | 'all'>('all');
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // Show the saved copy at once, then replace it with the server's when online.
    loadSavedLibrary().then((saved) => { if (active) setSnapshot((current) => current ?? saved); }).catch(() => undefined);
    refreshLibrary().then((fresh) => { if (active && fresh) setSnapshot(fresh); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const articles = snapshot?.articles ?? [];
  const results = useMemo(() => searchArticles(articles, { query, diseaseKey, topic }), [articles, query, diseaseKey, topic]);
  const open = openSlug ? articles.find((article) => article.slug === openSlug) ?? null : null;
  const show = (slug: string | null) => { setOpenSlug(slug); onScrollTop?.(); };
  const filtered = query.trim() !== '' || diseaseKey !== 'all' || topic !== 'all';

  if (open) return <ArticleReader article={open} onBack={() => show(null)} />;

  const diseaseOptions: DiseaseFilter[] = ['all', ...CLASS_KEYS, 'general'];
  return (
    <View style={styles.screen}>
      <Text style={styles.subtitle}>{t('library.subtitle')}</Text>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={palette.muted} />
        <TextInput value={query} onChangeText={setQuery} placeholder={t('library.search')} placeholderTextColor="#8a948e" style={styles.searchInput} returnKeyType="search" accessibilityLabel={t('library.search')} autoCorrect={false} />
        {query !== '' && <Pressable accessibilityRole="button" accessibilityLabel={t('library.clear')} onPress={() => setQuery('')} hitSlop={10}><Ionicons name="close-circle" size={18} color={palette.muted} /></Pressable>}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {diseaseOptions.map((key) => (
          <Chip key={key} active={diseaseKey === key} onPress={() => setDiseaseKey(key)} label={key === 'all' ? t('library.all') : diseaseLabel(key === 'general' ? null : key, language, t('library.general'))} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(['all', ...ARTICLE_TOPICS] as const).map((key) => (
          <Chip key={key} small active={topic === key} onPress={() => setTopic(key)} label={key === 'all' ? t('library.allTopics') : t(`library.topic.${key}` as StringKey)} />
        ))}
      </ScrollView>

      <View style={styles.statusRow}>
        <Text style={styles.count}>{t('library.count', { count: results.length })}</Text>
        <View style={styles.offline}><Ionicons name="cloud-download-outline" size={14} color={palette.success} /><Text style={styles.offlineText}>{t('library.offline')}</Text></View>
      </View>
      {language !== 'en' && <Text style={styles.note}>{t('library.englishOnly')}</Text>}

      {snapshot && results.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('library.noResults')}</Text>
          {filtered && <Pressable accessibilityRole="button" onPress={() => { setQuery(''); setDiseaseKey('all'); setTopic('all'); }}><Text style={styles.link}>{t('library.clear')}</Text></Pressable>}
        </View>
      )}

      {results.map((article) => {
        const cover = article.images.map(articleImageSource).find(Boolean);
        return (
        <Pressable key={article.slug} accessibilityRole="button" onPress={() => show(article.slug)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
          {cover && <Image source={cover} style={styles.cover} resizeMode="cover" accessibilityIgnoresInvertColors />}
          <View style={styles.cardTags}>
            <Text style={styles.tag}>{diseaseLabel(article.disease_key, language, t('library.general'))}</Text>
            <Text style={styles.tagMuted}>{t(`library.topic.${article.topic}` as StringKey)}</Text>
          </View>
          <Text style={styles.cardTitle}>{article.title}</Text>
          <Text style={styles.cardSummary} numberOfLines={3}>{article.summary}</Text>
          <Text style={styles.cardMeta}>{t('library.minutes', { count: article.reading_minutes })} · {t('library.references')}: {article.references.length}</Text>
        </Pressable>
        );
      })}

      {snapshot?.updatedAt && <Text style={styles.updated}>{t('library.updated', { date: new Date(snapshot.updatedAt).toLocaleDateString() })}</Text>}
    </View>
  );
}

function Chip({ label, active, onPress, small = false }: { label: string; active: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, small && styles.chipSmall, active && styles.chipActive]}>
      <Text style={[styles.chipText, small && styles.chipTextSmall, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ArticleReader({ article, onBack }: { article: LibraryArticle; onBack: () => void }) {
  const { t, language } = useT();
  return (
    <View style={styles.screen}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.back} hitSlop={8}>
        <Ionicons name="arrow-back" size={18} color={palette.green} />
        <Text style={styles.link}>{t('library.back')}</Text>
      </Pressable>
      <View style={styles.cardTags}>
        <Text style={styles.tag}>{diseaseLabel(article.disease_key, language, t('library.general'))}</Text>
        <Text style={styles.tagMuted}>{t(`library.topic.${article.topic}` as StringKey)}</Text>
      </View>
      <Text style={styles.readerTitle}>{article.title}</Text>
      <Text style={styles.cardMeta}>{t('library.by', { authors: article.authors })} · {t('library.minutes', { count: article.reading_minutes })}</Text>
      {language !== 'en' && <Text style={styles.note}>{t('library.englishOnly')}</Text>}
      <Text style={styles.lead}>{article.summary}</Text>
      <ArticleBody body={article.body} images={article.images} />

      <View style={styles.references}>
        <Text style={styles.heading2}>{t('library.references')}</Text>
        {article.references.map((ref, index) => (
          <View key={`${ref.title}-${index}`} style={styles.reference}>
            <Text style={styles.referenceText}>{index + 1}. {ref.authors}{ref.year ? ` (${ref.year})` : ''}. {ref.title}.{ref.journal_or_institution ? ` ${ref.journal_or_institution}.` : ''}{ref.doi ? ` doi:${ref.doi}` : ''}</Text>
            <View style={styles.cardTags}>
              {ref.peer_reviewed && <Text style={styles.tagMuted}>{t('library.peerReviewed')}</Text>}
              {ref.philippines_specific && <Text style={styles.tagMuted}>{t('library.philippines')}</Text>}
              {ref.reference_url && <Pressable accessibilityRole="link" onPress={() => { Linking.openURL(ref.reference_url as string).catch(() => undefined); }} hitSlop={6}><Text style={styles.link}>{t('library.openSource')}</Text></Pressable>}
            </View>
          </View>
        ))}
        <Text style={styles.note}>{t('library.disclaimer')}</Text>
      </View>
    </View>
  );
}

/** Renders "## Heading", "- bullet", "[[image:<file>]]" and plain paragraph lines. */
export function ArticleBody({ body, images = [] }: { body: string; images?: ArticleImage[] }) {
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
  return (
    <View style={styles.body}>
      {lines.map((line, index) => {
        const file = imageLineFile(line);
        if (file) {
          const photo = images.find((item) => item.file === file);
          return photo ? <ArticlePhoto key={index} photo={photo} /> : null;
        }
        if (line.startsWith('## ')) return <Text key={index} style={styles.heading2}>{line.slice(3)}</Text>;
        if (line.startsWith('- ')) return <View key={index} style={styles.bullet}><Text style={styles.bulletDot}>•</Text><Text style={[styles.bodyText, styles.bulletText]}>{line.slice(2)}</Text></View>;
        return <Text key={index} style={styles.bodyText}>{line}</Text>;
      })}
    </View>
  );
}

/** An article photo at its own shape, with caption, credit and license; tap to view full screen. */
function ArticlePhoto({ photo }: { photo: ArticleImage }) {
  const { t } = useT();
  const source = articleImageSource(photo);
  const [aspectRatio, setAspectRatio] = useState(() => {
    const asset = source && typeof source === 'number' ? Image.resolveAssetSource(source) : null;
    return asset?.width && asset.height ? asset.width / asset.height : 4 / 3;
  });
  useEffect(() => {
    if (!source || typeof source === 'number' || !('uri' in source) || !source.uri) return;
    Image.getSize(source.uri, (width, height) => { if (width && height) setAspectRatio(width / height); }, () => undefined);
  }, [source]);
  if (!source) return null;
  const credit = t('library.photoCredit', { credit: photo.credit, license: photo.license });
  return (
    <View style={styles.figure}>
      <ViewableImage source={source as ImageSourcePropType} title={photo.caption} style={[styles.photo, { aspectRatio }]} resizeMode="cover" />
      <Text style={styles.caption}>{photo.caption}</Text>
      {photo.source_url
        ? <Pressable accessibilityRole="link" onPress={() => { Linking.openURL(photo.source_url as string).catch(() => undefined); }} hitSlop={6}><Text style={[styles.credit, styles.creditLink]}>{credit}</Text></Pressable>
        : <Text style={styles.credit}>{credit}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 20 },
  searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: palette.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#fff' },
  searchInput: { flex: 1, color: palette.ink, fontSize: 15, paddingVertical: 10 },
  chips: { gap: 8, paddingRight: 8 },
  chip: { minHeight: 36, justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 13, backgroundColor: '#fff' },
  chipSmall: { minHeight: 32, paddingHorizontal: 11 },
  chipActive: { backgroundColor: palette.green, borderColor: palette.green },
  chipText: { color: '#2f4337', fontSize: 14, fontWeight: '700' },
  chipTextSmall: { fontSize: 13 },
  chipTextActive: { color: '#fff' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  count: { color: palette.muted, fontSize: 13, fontWeight: '700' },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  offlineText: { color: palette.success, fontSize: 12, fontWeight: '700' },
  note: { color: palette.muted, fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyText: { color: palette.muted, fontSize: 14 },
  card: { gap: 6, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', padding: 14 },
  cardPressed: { backgroundColor: palette.greenSoft },
  cardTags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  tag: { color: palette.green, backgroundColor: palette.greenSoft, fontSize: 12, fontWeight: '800', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  tagMuted: { color: '#4f5d55', backgroundColor: '#eef2ef', fontSize: 12, fontWeight: '700', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  cardTitle: { color: '#21382b', fontSize: 16, lineHeight: 21, fontWeight: '800' },
  cardSummary: { color: '#3c4c43', fontSize: 14, lineHeight: 20 },
  cardMeta: { color: palette.muted, fontSize: 12, fontWeight: '600' },
  updated: { color: palette.muted, fontSize: 12, textAlign: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36 },
  link: { color: palette.green, fontSize: 14, fontWeight: '800' },
  readerTitle: { color: palette.ink, fontSize: 23, lineHeight: 29, fontWeight: '800' },
  lead: { color: '#2b3d33', fontSize: 15, lineHeight: 22, fontWeight: '600' },
  body: { gap: 9 },
  heading2: { color: '#22372c', fontSize: 17, fontWeight: '800', marginTop: 6 },
  bodyText: { color: '#3c4c43', fontSize: 15, lineHeight: 22 },
  bulletText: { flex: 1 },
  bullet: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
  bulletDot: { color: palette.green, fontSize: 15, lineHeight: 22, fontWeight: '800' },
  cover: { width: '100%', height: 150, borderRadius: 10, backgroundColor: '#edf1ee', marginBottom: 2 },
  figure: { gap: 5, marginVertical: 4 },
  photo: { width: '100%', borderRadius: 12, backgroundColor: '#edf1ee' },
  caption: { color: '#3c4c43', fontSize: 13, lineHeight: 18 },
  credit: { color: palette.muted, fontSize: 11, lineHeight: 15 },
  creditLink: { textDecorationLine: 'underline' },
  references: { gap: 10, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 12, marginTop: 4 },
  reference: { gap: 5 },
  referenceText: { color: '#3c4c43', fontSize: 13, lineHeight: 19 },
});
