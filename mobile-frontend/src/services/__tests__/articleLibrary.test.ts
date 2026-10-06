// The phone resolves server-relative photo paths against the server it is connected to.
jest.mock('../api', () => ({
  api: jest.fn(), fetchPrivateImage: jest.fn(), hasConnectedConfiguration: jest.fn(() => true),
  resolveServerUrl: jest.fn((value?: string | null) => (value?.startsWith('/') ? `https://dahonmd.example${value}` : null)),
}));

// An in-memory stand-in for expo-file-system's File/Directory classes.
const mockFiles = new Map<string, Uint8Array>();
jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(base: { uri: string } | string, name: string) { this.uri = `${typeof base === 'string' ? base : base.uri}/${name}`; }
    get exists() { return true; }
    create() {}
  }
  class File {
    uri: string;
    constructor(directory: { uri: string }, name: string) { this.uri = `${directory.uri}/${name}`; }
    get exists() { return mockFiles.has(this.uri); }
    get size() { return mockFiles.get(this.uri)?.length ?? 0; }
    create() { mockFiles.set(this.uri, new Uint8Array()); }
    delete() { mockFiles.delete(this.uri); }
    write(bytes: Uint8Array) { mockFiles.set(this.uri, bytes); }
  }
  return { Directory, File, Paths: { document: { uri: 'file:///documents' } } };
});

const mockState = new Map<string, string>();
jest.mock('../../storage/localDiagnoses', () => ({
  deviceStateValue: jest.fn(async (key: string, value?: string) => {
    if (value !== undefined) { mockState.set(key, value); return value; }
    return mockState.get(key) ?? null;
  }),
}));

import fs from 'fs';
import path from 'path';

import { api, fetchPrivateImage, hasConnectedConfiguration } from '../api';
import { articleImageSource, bundledArticles, imageLineFile, loadSavedLibrary, numberedLineText, parseInline, refreshLibrary, searchArticles } from '../articleLibrary';
import { BUNDLED_LIBRARY_IMAGES } from '../../features/library/libraryImages';
import { CLASS_KEYS } from '../../features/classification/disease-data';

const mockedApi = api as jest.Mock;
const mockedFetchImage = fetchPrivateImage as jest.Mock;
const all = { query: '', diseaseKey: 'all' as const, topic: 'all' as const };

beforeEach(() => {
  jest.clearAllMocks();
  mockState.clear();
  mockFiles.clear();
  (hasConnectedConfiguration as jest.Mock).mockReturnValue(true);
});

describe('bundled library', () => {
  it('is the same file the backend seeds from', () => {
    const backendCopy = path.resolve(__dirname, '../../../../backend/database/data/library-articles.json');
    const mobileCopy = path.resolve(__dirname, '../../features/library/library-articles.json');
    expect(JSON.parse(fs.readFileSync(mobileCopy, 'utf8'))).toEqual(JSON.parse(fs.readFileSync(backendCopy, 'utf8')));
  });

  it('gives every article references with links and covers every leaf class', () => {
    const articles = bundledArticles();
    expect(articles.length).toBeGreaterThanOrEqual(12);
    for (const article of articles) {
      expect(article.references.length).toBeGreaterThan(0);
      for (const ref of article.references) {
        expect(ref.title).not.toBe('');
        expect(ref.reference_url).toMatch(/^https:\/\//);
      }
    }
    for (const key of CLASS_KEYS) expect(articles.some((article) => article.disease_key === key)).toBe(true);
  });
});

describe('article text marks', () => {
  it('splits bold, italic and bold-italic text', () => {
    expect(parseInline('Cut **old** leaves *now*, ***today***.')).toEqual([
      { text: 'Cut ', bold: false, italic: false },
      { text: 'old', bold: true, italic: false },
      { text: ' leaves ', bold: false, italic: false },
      { text: 'now', bold: false, italic: true },
      { text: ', ', bold: false, italic: false },
      { text: 'today', bold: true, italic: true },
      { text: '.', bold: false, italic: false },
    ]);
  });

  it('leaves lone asterisks as plain text', () => {
    expect(parseInline('5 * 3 kg')).toEqual([{ text: '5 * 3 kg', bold: false, italic: false }]);
  });

  it('reads numbered steps', () => {
    expect(numberedLineText('2. Burn the leaves')).toBe('Burn the leaves');
    expect(numberedLineText('2024 was dry')).toBeNull();
  });
});

describe('searchArticles', () => {
  const articles = bundledArticles();

  it('matches every word, ignoring case, and puts title matches first', () => {
    const results = searchArticles(articles, { ...all, query: 'GCTCV resistant' });
    expect(results[0].slug).toBe('panama-resistant-varieties');
    expect(results.every((a) => `${a.title} ${a.summary} ${a.body}`.toLowerCase().includes('gctcv'))).toBe(true);
    expect(searchArticles(articles, { ...all, query: 'deleafing' }).map((a) => a.slug)).toContain('sigatoka-deleafing');
  });

  it('searches reference authors too', () => {
    expect(searchArticles(articles, { ...all, query: 'Ploetz' }).every((a) => a.references.some((r) => r.authors.includes('Ploetz')))).toBe(true);
  });

  it('filters by leaf condition, general topics and topic', () => {
    expect(searchArticles(articles, { ...all, diseaseKey: 'panama-disease' }).every((a) => a.disease_key === 'panama-disease')).toBe(true);
    expect(searchArticles(articles, { ...all, diseaseKey: 'general' }).map((a) => a.slug)).toEqual(['pesticide-safety-check']);
    expect(searchArticles(articles, { ...all, topic: 'varieties' }).map((a) => a.slug)).toEqual(['panama-resistant-varieties']);
    expect(searchArticles(articles, { ...all, query: 'zzzz-nothing' })).toEqual([]);
  });
});

describe('article photos', () => {
  const articles = bundledArticles();

  it('ships every placed photo with the app, as WebP, with a credit and license', () => {
    const imageDir = path.resolve(__dirname, '../../features/library/images');
    const backendDir = path.resolve(__dirname, '../../../../backend/database/data/library-images');
    for (const article of articles) {
      const placed = article.body.split('\n').map(imageLineFile).filter(Boolean);
      expect(placed.sort()).toEqual(article.images.map((photo) => photo.file).sort());
      for (const photo of article.images) {
        expect(photo.file).toMatch(/^[a-z0-9-]+\.webp$/);
        expect(BUNDLED_LIBRARY_IMAGES[photo.file]).toBeDefined();
        expect(fs.readFileSync(path.join(imageDir, photo.file))).toEqual(fs.readFileSync(path.join(backendDir, photo.file)));
        expect(photo.caption).not.toBe('');
        expect(photo.credit).not.toBe('');
        expect(photo.license).not.toBe('');
        expect(photo.source_url).toMatch(/^https:\/\//);
      }
    }
    expect(articles.filter((article) => article.images.length).length).toBeGreaterThanOrEqual(5);
    expect(fs.readdirSync(imageDir).sort()).toEqual(Object.keys(BUNDLED_LIBRARY_IMAGES).sort());
  });

  it('does not count photo lines as reading time', () => {
    const withPhoto = articles.find((article) => article.slug === 'panama-sick-plant');
    expect(withPhoto?.body.startsWith('[[image:panama-stem-streaks.webp]]')).toBe(true);
    expect(imageLineFile('[[image:panama-stem-streaks.webp]]')).toBe('panama-stem-streaks.webp');
    expect(imageLineFile('A normal sentence.')).toBeNull();
  });

  it('saves admin-added photos on the phone and reuses bundled ones', async () => {
    mockedFetchImage.mockResolvedValue(new Uint8Array([82, 73, 70, 70]));
    mockedApi.mockResolvedValue({ data: [{
      slug: 'with-photos', title: 'With photos', disease_key: 'sigatoka', topic: 'field_care', language: 'en',
      summary: 'Summary', body: '[[image:new-photo.webp]]\nText\n[[image:cordana-edge-lesion.webp]]', authors: 'Admin', reading_minutes: 1, published_at: null,
      images: [
        { file: 'new-photo.webp', caption: 'New', credit: 'Admin', license: 'CC0 1.0', url: '/api/article-images/new-photo.webp' },
        { file: 'cordana-edge-lesion.webp', caption: 'Bundled', credit: 'Scot Nelson', license: 'CC0 1.0', url: '/api/article-images/cordana-edge-lesion.webp' },
      ],
      references: [{ title: 'Source', authors: 'Author', reference_url: 'https://example.org' }],
    }] });

    const fresh = await refreshLibrary();
    expect(mockedFetchImage).toHaveBeenCalledTimes(1);
    expect(mockedFetchImage).toHaveBeenCalledWith('/api/article-images/new-photo.webp');
    const [added, bundledPhoto] = fresh!.articles[0].images;
    expect(added.local_uri).toBe('file:///documents/library-images/new-photo.webp');
    expect(articleImageSource(added)).toEqual({ uri: 'file:///documents/library-images/new-photo.webp' });
    expect(articleImageSource(bundledPhoto)).toBe(BUNDLED_LIBRARY_IMAGES['cordana-edge-lesion.webp']);

    // Offline later: the saved copy still points at the photo on the phone.
    const offline = await loadSavedLibrary();
    expect(offline.articles[0].images[0].local_uri).toBe('file:///documents/library-images/new-photo.webp');
  });

  it('keeps the server address when a photo cannot be saved', async () => {
    mockedFetchImage.mockRejectedValue(new Error('offline'));
    mockedApi.mockResolvedValue({ data: [{ slug: 'a', title: 'A', topic: 'field_care', summary: '', body: '[[image:other.webp]]', authors: '', references: [],
      images: [{ file: 'other.webp', caption: 'c', credit: 'c', license: 'CC0', url: '/api/article-images/other.webp' }] }] });
    const fresh = await refreshLibrary();
    expect(fresh!.articles[0].images[0].local_uri).toBeNull();
    expect(articleImageSource(fresh!.articles[0].images[0])).toEqual({ uri: 'https://dahonmd.example/api/article-images/other.webp' });
  });
});

describe('offline storage', () => {
  it('falls back to the bundled articles before the first download', async () => {
    const saved = await loadSavedLibrary();
    expect(saved.fromServer).toBe(false);
    expect(saved.articles.length).toBe(bundledArticles().length);
  });

  it('keeps the downloaded library on the phone for later offline reading', async () => {
    mockedApi.mockResolvedValue({ data: [{
      slug: 'new-admin-article', title: 'New admin article', disease_key: 'sigatoka', topic: 'treatment', language: 'en',
      summary: 'Summary', body: 'Body text', authors: 'Admin', reading_minutes: 2, published_at: null,
      references: [{ title: 'Source', authors: 'Author', year: 2024, reference_url: 'https://example.org', peer_reviewed: true, philippines_specific: false }],
    }] });

    const fresh = await refreshLibrary();
    expect(mockedApi).toHaveBeenCalledWith('/articles');
    expect(fresh?.articles.map((a) => a.slug)).toEqual(['new-admin-article']);

    const offline = await loadSavedLibrary();
    expect(offline.fromServer).toBe(true);
    expect(offline.articles[0].references[0].reference_url).toBe('https://example.org');
  });

  it('keeps the saved copy when the server cannot be reached', async () => {
    mockedApi.mockRejectedValue(new Error('offline'));
    expect(await refreshLibrary()).toBeNull();
    expect((await loadSavedLibrary()).fromServer).toBe(false);
    (hasConnectedConfiguration as jest.Mock).mockReturnValue(false);
    expect(await refreshLibrary()).toBeNull();
  });
});
