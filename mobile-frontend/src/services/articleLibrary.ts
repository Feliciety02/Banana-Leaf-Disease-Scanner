import { Directory, File, Paths } from 'expo-file-system';

import { api, fetchPrivateImage, hasConnectedConfiguration, resolveServerUrl } from './api';
import { deviceStateValue } from '../storage/localDiagnoses';
import bundled from '../features/library/library-articles.json';
import { BUNDLED_LIBRARY_IMAGES } from '../features/library/libraryImages';

export type ArticleTopic = 'field_care' | 'prevention' | 'treatment' | 'varieties' | 'identification' | 'safety' | 'research';
export const ARTICLE_TOPICS: ArticleTopic[] = ['field_care', 'prevention', 'treatment', 'varieties', 'identification', 'safety', 'research'];

export type ArticleReference = {
  title: string;
  authors: string;
  year: number | null;
  journal_or_institution: string | null;
  doi: string | null;
  reference_url: string | null;
  peer_reviewed: boolean;
  philippines_specific: boolean;
};

/** A photo placed in an article body by a "[[image:<file>]]" line. */
export type ArticleImage = {
  file: string;
  caption: string;
  credit: string;
  license: string;
  license_url: string | null;
  source_url: string | null;
  /** Server address of a photo added by an admin (null for bundled photos). */
  url: string | null;
  /** The copy saved on this phone for offline reading. */
  local_uri: string | null;
};

export type LibraryArticle = {
  slug: string;
  title: string;
  /** A model class key, or null for general farm topics. */
  disease_key: string | null;
  topic: ArticleTopic;
  language: string;
  summary: string;
  body: string;
  images: ArticleImage[];
  authors: string;
  reading_minutes: number;
  published_at: string | null;
  references: ArticleReference[];
};

export type LibrarySnapshot = { articles: LibraryArticle[]; updatedAt: string | null; fromServer: boolean };

const CACHE_KEY = 'library:articles';

const IMAGE_LINE = /^\[\[image:([^\]]+)\]\]$/;

function readingMinutes(body: string) {
  const text = body.split('\n').filter((line) => !IMAGE_LINE.test(line.trim())).join(' ');
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200));
}

function image(raw: Record<string, unknown>): ArticleImage {
  return {
    file: String(raw.file ?? ''),
    caption: String(raw.caption ?? ''),
    credit: String(raw.credit ?? ''),
    license: String(raw.license ?? ''),
    license_url: (raw.license_url as string | null) ?? null,
    source_url: (raw.source_url as string | null) ?? null,
    url: (raw.url as string | null) ?? null,
    local_uri: (raw.local_uri as string | null) ?? null,
  };
}

/** The photo file named by a "[[image:<file>]]" body line, or null for any other line. */
export function imageLineFile(line: string): string | null {
  return IMAGE_LINE.exec(line.trim())?.[1].trim() ?? null;
}

export type InlineSpan = { text: string; bold: boolean; italic: boolean };

const INLINE_MARK = /(\*{1,3})([^*\s](?:[^*]*[^*\s])?)\1/g;

/** Splits one line of article text on "**bold**", "*italic*" and "***both***" marks. */
export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_MARK)) {
    const index = match.index ?? 0;
    if (index > last) spans.push({ text: text.slice(last, index), bold: false, italic: false });
    const marks = match[1].length;
    spans.push({ text: match[2], bold: marks >= 2, italic: marks !== 2 });
    last = index + match[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last), bold: false, italic: false });
  return spans;
}

/** The text of a "1. step" line, or null for any other line. */
export function numberedLineText(line: string): string | null {
  return /^\d+[.)]\s+(.*)$/.exec(line)?.[1] ?? null;
}

/** Bundled photo, else the copy saved on the phone, else the server address. */
export function articleImageSource(photo: ArticleImage) {
  if (BUNDLED_LIBRARY_IMAGES[photo.file]) return BUNDLED_LIBRARY_IMAGES[photo.file];
  if (photo.local_uri) return { uri: photo.local_uri };
  const remote = resolveServerUrl(photo.url);
  return remote ? { uri: remote } : null;
}

function imageDirectory() {
  const directory = new Directory(Paths.document, 'library-images');
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return directory;
}

/**
 * Saves photos an admin added after this app was built, so they show offline
 * too. Photos already bundled with the app are never downloaded. A failed
 * download keeps the server address; the photo then only shows online.
 */
async function savePhotosOffline(articles: LibraryArticle[]) {
  const directory = imageDirectory();
  for (const article of articles) {
    for (const photo of article.images) {
      if (BUNDLED_LIBRARY_IMAGES[photo.file] || !photo.url || !/^[a-z0-9][a-z0-9-]*\.webp$/.test(photo.file)) continue;
      const file = new File(directory, photo.file);
      try {
        if (!file.exists || file.size === 0) {
          const bytes = await fetchPrivateImage(photo.url);
          if (file.exists) file.delete();
          file.create();
          file.write(bytes);
        }
        photo.local_uri = file.uri;
      } catch {
        photo.local_uri = null;
      }
    }
  }
}

function reference(source: Record<string, unknown>): ArticleReference {
  return {
    title: String(source.title ?? ''),
    authors: String(source.authors ?? ''),
    year: typeof source.year === 'number' ? source.year : null,
    journal_or_institution: (source.journal_or_institution as string | null) ?? null,
    doi: (source.doi as string | null) ?? null,
    reference_url: (source.reference_url as string | null) ?? null,
    peer_reviewed: Boolean(source.peer_reviewed),
    philippines_specific: Boolean(source.philippines_specific),
  };
}

/** The articles shipped inside the app, readable on first launch without any connection. */
export function bundledArticles(): LibraryArticle[] {
  const sources = bundled.sources as Record<string, Record<string, unknown>>;
  return bundled.articles.map((item) => ({
    slug: item.slug,
    title: item.title,
    disease_key: item.disease,
    topic: item.topic as ArticleTopic,
    language: 'en',
    summary: item.summary,
    body: item.body,
    images: ((item as { images?: Record<string, unknown>[] }).images ?? []).map(image),
    authors: item.authors,
    reading_minutes: readingMinutes(item.body),
    published_at: item.published_at,
    references: item.references.map((key) => reference(sources[key])),
  }));
}

function fromServer(item: Record<string, unknown>): LibraryArticle {
  return {
    slug: String(item.slug),
    title: String(item.title),
    disease_key: (item.disease_key as string | null) ?? null,
    topic: (ARTICLE_TOPICS.includes(item.topic as ArticleTopic) ? item.topic : 'field_care') as ArticleTopic,
    language: String(item.language ?? 'en'),
    summary: String(item.summary ?? ''),
    body: String(item.body ?? ''),
    images: Array.isArray(item.images) ? item.images.map((raw) => image(raw as Record<string, unknown>)) : [],
    authors: String(item.authors ?? ''),
    reading_minutes: Number(item.reading_minutes) || readingMinutes(String(item.body ?? '')),
    published_at: (item.published_at as string | null) ?? null,
    references: Array.isArray(item.references) ? item.references.map((source) => reference(source as Record<string, unknown>)) : [],
  };
}

/** The last library downloaded to this phone, or the bundled one. Never needs a connection. */
export async function loadSavedLibrary(): Promise<LibrarySnapshot> {
  try {
    const saved = await deviceStateValue(CACHE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as { articles: LibraryArticle[]; updatedAt: string };
      if (Array.isArray(parsed.articles)) return { articles: parsed.articles, updatedAt: parsed.updatedAt ?? null, fromServer: true };
    }
  } catch {
    // A damaged copy falls back to the bundled articles.
  }
  return { articles: bundledArticles(), updatedAt: null, fromServer: false };
}

/**
 * Downloads the current library and keeps it on the phone, so articles an
 * admin adds or edits can be read offline later. Returns null when offline.
 */
export async function refreshLibrary(): Promise<LibrarySnapshot | null> {
  if (!hasConnectedConfiguration()) return null;
  try {
    const payload = await api<Record<string, unknown>[]>('/articles');
    const articles = payload.data.map(fromServer);
    await savePhotosOffline(articles);
    const updatedAt = new Date().toISOString();
    await deviceStateValue(CACHE_KEY, JSON.stringify({ articles, updatedAt }));
    return { articles, updatedAt, fromServer: true };
  } catch {
    return null;
  }
}

function normalize(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export type LibraryFilter = { query: string; diseaseKey: string | 'all' | 'general'; topic: ArticleTopic | 'all' };

/** Every word of the query must appear in the title, summary, body, authors or references. Title matches come first. */
export function searchArticles(articles: LibraryArticle[], filter: LibraryFilter): LibraryArticle[] {
  const words = normalize(filter.query).split(/\s+/).filter(Boolean);
  const matches = articles.filter((article) => {
    if (filter.diseaseKey === 'general' ? article.disease_key !== null : filter.diseaseKey !== 'all' && article.disease_key !== filter.diseaseKey) return false;
    if (filter.topic !== 'all' && article.topic !== filter.topic) return false;
    if (!words.length) return true;
    const haystack = normalize([article.title, article.summary, article.body, article.authors, ...article.images.map((photo) => photo.caption), ...article.references.map((ref) => `${ref.title} ${ref.authors}`)].join(' '));
    return words.every((word) => haystack.includes(word));
  });
  if (!words.length) return matches;
  const titleScore = (article: LibraryArticle) => words.filter((word) => normalize(article.title).includes(word)).length;
  return [...matches].sort((a, b) => titleScore(b) - titleScore(a));
}
