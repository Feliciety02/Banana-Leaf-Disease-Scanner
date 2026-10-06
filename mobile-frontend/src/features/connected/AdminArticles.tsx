import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import Ionicons from '@expo/vector-icons/Ionicons';

import { api, uploadFile } from '../../services/api';
import { ArticleBody } from '../library/LibraryScreen';
import { insertBlockLine, toggleInlineMark, toggleLineKind, type Edit, type LineKind, type Selection } from './articleFormatting';
import { ActionButton, Choice, ConfirmSheet, Empty, Field, formatDate, Loading, ModalSheet, Notice, palette, SectionHeader, titleCase, uiStyles } from './ui';

// Same fields and rules as the website's Article Library (backend ArticleRequest).
const TOPICS = ['field_care', 'prevention', 'treatment', 'varieties', 'identification', 'safety', 'research'] as const;
const CONDITIONS = ['', 'healthy', 'sigatoka', 'panama-disease', 'cordana-leaf-spot'] as const;
const LANGUAGES: Record<string, string> = { english: 'en', filipino: 'fil' };

type ArticlePhoto = { file: string; caption: string; credit: string; license: string; license_url: string; source_url: string };
type Article = {
  id: number; title: string; disease_key: string | null; topic: string; language: string; summary: string; body: string; authors: string;
  status: 'draft' | 'published'; reading_minutes?: number; updated_at?: string;
  references?: Array<{ id: number }>; images?: Array<Partial<ArticlePhoto> & { file: string; url?: string }>;
};
type Source = { id: number; title: string; authors: string; year?: number | null };

const emptyArticle = { title: '', disease_key: '', topic: 'field_care', language: 'en', summary: '', body: '', authors: '', status: 'draft' as 'draft' | 'published', source_ids: [] as number[], images: [] as ArticlePhoto[] };
type ArticleForm = typeof emptyArticle;

function messageOf(error: unknown) { return error instanceof Error ? error.message : 'The request could not be completed.'; }

export function ArticlesScreen() {
  const [items, setItems] = useState<Article[]>([]); const [sources, setSources] = useState<Source[]>([]);
  const [form, setForm] = useState<ArticleForm>(emptyArticle); const [editing, setEditing] = useState<Article | null>(null); const [modal, setModal] = useState(false);
  const [deleting, setDeleting] = useState<Article | null>(null); const [sourceQuery, setSourceQuery] = useState('');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  // Where the cursor is in the article text, so toolbar buttons act on it.
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [forcedSelection, setForcedSelection] = useState<Selection | undefined>(); const [preview, setPreview] = useState(false);
  const bodyInput = useRef<TextInput>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [articles, references] = await Promise.all([api<Article[]>('/admin/articles'), api<Source[]>('/admin/research-sources')]);
      setItems(articles.data); setSources(references.data); setError('');
    } catch (e) { setError(messageOf(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const resetEditor = () => { setSelection({ start: 0, end: 0 }); setForcedSelection(undefined); setPreview(false); };
  const openCreate = () => { setEditing(null); setForm(emptyArticle); setSourceQuery(''); setError(''); resetEditor(); setModal(true); };
  const openEdit = (item: Article) => {
    setEditing(item);
    setForm({
      ...emptyArticle, title: item.title, disease_key: item.disease_key || '', topic: item.topic, language: item.language, summary: item.summary, body: item.body, authors: item.authors, status: item.status,
      source_ids: (item.references || []).map((ref) => ref.id),
      images: (item.images || []).map((photo) => ({ file: photo.file, caption: photo.caption || '', credit: photo.credit || '', license: photo.license || '', license_url: photo.license_url || '', source_url: photo.source_url || '' })),
    });
    setSourceQuery(''); setError(''); resetEditor(); setModal(true);
  };

  const applyEdit = (edit: Edit) => {
    setForm((current) => ({ ...current, body: edit.text }));
    setSelection(edit.selection); setForcedSelection(edit.selection); setPreview(false);
    bodyInput.current?.focus();
  };
  const formatLine = (kind: LineKind) => applyEdit(toggleLineKind(form.body, selection, kind));
  const formatInline = (mark: string) => applyEdit(toggleInlineMark(form.body, selection, mark));

  const submit = async () => {
    if (!form.title.trim() || !form.authors.trim() || !form.summary.trim() || !form.body.trim()) { setError('Title, authors, summary and article text are required.'); return; }
    if (form.status === 'published' && !form.source_ids.length) { setError('Choose at least one research source before publishing.'); return; }
    if (form.images.some((photo) => !photo.caption.trim() || !photo.credit.trim() || !photo.license.trim())) { setError('Every photo needs a caption, credit and license.'); return; }
    setBusy(true);
    try {
      const body = { ...form, disease_key: form.disease_key || null, images: form.images.map((photo) => ({ ...photo, license_url: photo.license_url || null, source_url: photo.source_url || null })) };
      await api(`/admin/articles${editing ? `/${editing.id}` : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) });
      const wasEditing = Boolean(editing);
      setModal(false); setEditing(null);
      setMessage(wasEditing ? 'Article updated. Farmers get the change on their next connection.' : form.status === 'published' ? 'Article published for farmers.' : 'Article saved as a draft.');
      setError(''); await load();
    } catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!deleting) return; setBusy(true);
    try { await api(`/admin/articles/${deleting.id}`, { method: 'DELETE' }); setDeleting(null); setMessage('Article deleted.'); await load(); }
    catch (e) { setDeleting(null); setError(messageOf(e)); } finally { setBusy(false); }
  };

  // The server saves photos as WebP; each photo gets its own [[image:file]] line in the text.
  const addPhoto = async () => {
    setError('');
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.9 });
    if (picked.canceled) return;
    setUploading(true);
    try {
      const context = ImageManipulator.manipulate(picked.assets[0].uri);
      context.resize({ width: 1600 });
      const photo = await (await context.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      const payload = await uploadFile<{ file: string }>('/admin/article-images', photo.uri, { fieldName: 'image', mimeType: 'image/jpeg' });
      const file = payload.data.file;
      // Uses the latest text, in case the admin kept typing during the upload.
      setForm((current) => ({ ...current, images: [...current.images, { file, caption: '', credit: '', license: '', license_url: '', source_url: '' }], body: insertBlockLine(current.body, selection, `[[image:${file}]]`).text }));
    } catch (e) { setError(messageOf(e)); } finally { setUploading(false); }
  };
  const updatePhoto = (file: string, field: keyof ArticlePhoto, value: string) => setForm((current) => ({ ...current, images: current.images.map((photo) => photo.file === file ? { ...photo, [field]: value } : photo) }));
  const removePhoto = (file: string) => setForm((current) => ({ ...current, images: current.images.filter((photo) => photo.file !== file), body: current.body.split('\n').filter((line) => line.trim() !== `[[image:${file}]]`).join('\n') }));
  const toggleSource = (id: number) => setForm((current) => ({ ...current, source_ids: current.source_ids.includes(id) ? current.source_ids.filter((value) => value !== id) : [...current.source_ids, id] }));

  const query = sourceQuery.trim().toLowerCase();
  const sourceMatches = sources.filter((source) => form.source_ids.includes(source.id) || `${source.title} ${source.authors} ${source.year || ''}`.toLowerCase().includes(query));
  const languageName = Object.keys(LANGUAGES).find((key) => LANGUAGES[key] === form.language) || 'english';

  return <View style={uiStyles.stack}>
    <SectionHeader title="Articles" text="Write the study content farmers read in the Library. Published articles must cite at least one research source." action={<ActionButton icon="add" onPress={openCreate}>Add article</ActionButton>} />
    {message && <Notice tone="success">{message}</Notice>}{error && !modal && <Notice>{error}</Notice>}
    {loading ? <Loading /> : items.length ? items.map((item) => <View key={item.id} style={uiStyles.card}>
      <View style={uiStyles.rowBetween}><View style={uiStyles.flex}><Text style={uiStyles.cardTitle}>{item.title}</Text><Text style={uiStyles.cardMeta}>{item.authors}</Text></View><Text style={uiStyles.pill}>{titleCase(item.status)}</Text></View>
      <Text style={uiStyles.cardMeta}>{item.disease_key ? titleCase(item.disease_key) : 'General'} · {titleCase(item.topic)} · {(item.references || []).length} references · updated {formatDate(item.updated_at)}</Text>
      <View style={uiStyles.actions}><ActionButton variant="secondary" icon="create-outline" onPress={() => openEdit(item)}>Edit</ActionButton><ActionButton variant="ghost" icon="trash-outline" onPress={() => setDeleting(item)}>Delete</ActionButton></View>
    </View>) : <Empty title="No articles yet" text="Add an article and cite the research sources it summarises." />}

    <ModalSheet visible={modal} title={editing ? 'Edit article' : 'Add article'} description="Write in plain language for farmers. Use the toolbar for headings, bold, lists and photos." onClose={() => { if (!busy) setModal(false); }}>
      <Field label="Title" value={form.title} maxLength={255} onChangeText={(title) => setForm({ ...form, title })} />
      <Field label="Authors" value={form.authors} maxLength={500} placeholder="Who wrote or compiled this article" onChangeText={(authors) => setForm({ ...form, authors })} />
      <Choice label="Leaf condition" value={form.disease_key} options={CONDITIONS} emptyLabel="General" onChange={(disease_key) => setForm({ ...form, disease_key })} />
      <Choice label="Topic" value={form.topic} options={TOPICS} onChange={(topic) => setForm({ ...form, topic })} />
      <Choice label="Language" value={languageName} options={Object.keys(LANGUAGES)} onChange={(name) => setForm({ ...form, language: LANGUAGES[name] })} />
      <Field label="Summary" multiline value={form.summary} maxLength={1000} onChangeText={(summary) => setForm({ ...form, summary })} />
      <View style={styles.editor}>
        <Text style={styles.groupTitle}>Article text</Text>
        <View style={styles.toolbar} accessibilityRole="toolbar">
          <ToolButton label="Heading" text="H" onPress={() => formatLine('heading')} />
          <ToolButton label="Bold" text="B" textStyle={styles.toolBold} onPress={() => formatInline('**')} />
          <ToolButton label="Italic" text="I" textStyle={styles.toolItalic} onPress={() => formatInline('*')} />
          <ToolButton label="Bulleted list" icon="list" onPress={() => formatLine('bullet')} />
          <ToolButton label="Numbered list" text="1." onPress={() => formatLine('numbered')} />
          <ToolButton label="Insert photo here" icon="image-outline" disabled={uploading || form.images.length >= 10} onPress={addPhoto} />
          <View style={styles.toolSpacer} />
          <ToolButton label={preview ? 'Edit text' : 'Preview as farmers see it'} icon={preview ? 'create-outline' : 'eye-outline'} active={preview} onPress={() => setPreview(!preview)} />
        </View>
        {preview
          ? <View style={styles.preview}>{form.body.trim() ? <ArticleBody body={form.body} images={form.images.map((photo) => ({ ...photo, license_url: photo.license_url || null, source_url: photo.source_url || null, url: `/api/article-images/${encodeURIComponent(photo.file)}`, local_uri: null }))} /> : <Text style={uiStyles.cardMeta}>Nothing to preview yet.</Text>}</View>
          : <TextInput
            ref={bodyInput}
            multiline
            value={form.body}
            maxLength={30000}
            placeholder="Write the article here. Select words, then tap B or I. Tap H, a list button or the photo button to format the line you are on."
            placeholderTextColor="#8a9892"
            selection={forcedSelection}
            onSelectionChange={(event) => { setSelection(event.nativeEvent.selection); setForcedSelection(undefined); }}
            onChangeText={(body) => setForm((current) => ({ ...current, body }))}
            style={styles.body}
          />}
        <Text style={uiStyles.cardMeta}>{uploading ? 'Uploading photo…' : 'Photos go where the cursor is. Use Preview to check the article before saving.'}</Text>
      </View>

      <Text style={styles.groupTitle}>Photos ({form.images.length})</Text>
      <Text style={uiStyles.cardMeta}>Use only photos you may reuse. Add a caption, credit and license for each one.</Text>
      {form.images.map((photo) => <View key={photo.file} style={uiStyles.card}>
        {!form.body.includes(`[[image:${photo.file}]]`) && <View style={uiStyles.rowBetween}>
          <Text style={[uiStyles.cardMeta, uiStyles.flex]}>Not in the article text.</Text>
          <ActionButton variant="secondary" icon="arrow-down-outline" onPress={() => applyEdit(insertBlockLine(form.body, selection, `[[image:${photo.file}]]`))}>Place at cursor</ActionButton>
        </View>}
        <Field label="Caption" value={photo.caption} maxLength={300} onChangeText={(value) => updatePhoto(photo.file, 'caption', value)} />
        <Field label="Credit" value={photo.credit} maxLength={300} placeholder="Photographer or source" onChangeText={(value) => updatePhoto(photo.file, 'credit', value)} />
        <Field label="License" value={photo.license} maxLength={100} placeholder="CC0 1.0, CC BY 4.0, own photo" onChangeText={(value) => updatePhoto(photo.file, 'license', value)} />
        <Field label="License link (optional)" value={photo.license_url} keyboardType="url" autoCapitalize="none" onChangeText={(value) => updatePhoto(photo.file, 'license_url', value)} />
        <Field label="Source page (optional)" value={photo.source_url} keyboardType="url" autoCapitalize="none" onChangeText={(value) => updatePhoto(photo.file, 'source_url', value)} />
        <ActionButton variant="ghost" icon="trash-outline" onPress={() => removePhoto(photo.file)}>Remove photo</ActionButton>
      </View>)}
      <ActionButton variant="secondary" icon="image-outline" disabled={uploading || form.images.length >= 10} onPress={addPhoto}>{uploading ? 'Uploading…' : 'Add photo'}</ActionButton>

      <Text style={styles.groupTitle}>References ({form.source_ids.length} selected)</Text>
      <Field label="Search research sources" value={sourceQuery} onChangeText={setSourceQuery} />
      {sourceMatches.map((source) => { const checked = form.source_ids.includes(source.id); return <Pressable key={source.id} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => toggleSource(source.id)} style={[styles.source, checked && styles.sourceChecked]}>
        <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={20} color={palette.green} />
        <Text style={styles.sourceText}>{source.authors} ({source.year || 'n.d.'}). {source.title}</Text>
      </Pressable>; })}
      {!sources.length && <Text style={uiStyles.cardMeta}>Add sources under Research sources first.</Text>}

      <Choice label="Status" value={form.status} options={['draft', 'published']} onChange={(status) => setForm({ ...form, status: status as ArticleForm['status'] })} />
      {error && <Notice>{error}</Notice>}
      <View style={uiStyles.actions}><ActionButton variant="secondary" disabled={busy} onPress={() => setModal(false)}>Cancel</ActionButton><ActionButton disabled={busy || uploading} onPress={submit}>{busy ? 'Saving…' : editing ? 'Save article' : 'Add article'}</ActionButton></View>
    </ModalSheet>
    <ConfirmSheet visible={Boolean(deleting)} title="Delete article?" text={`Delete "${deleting?.title || 'this article'}". Phones remove it on their next connection.`} confirmLabel="Delete article" busy={busy} onCancel={() => setDeleting(null)} onConfirm={remove} />
  </View>;
}

function ToolButton({ label, text, icon, onPress, disabled, active, textStyle }: { label: string; text?: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; active?: boolean; textStyle?: object }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected: active }} disabled={disabled} hitSlop={2} onPress={onPress} style={({ pressed }) => [styles.tool, active && styles.toolActive, (pressed || disabled) && styles.toolDim]}>
    {icon ? <Ionicons name={icon} size={20} color={active ? '#fff' : palette.ink} /> : <Text style={[styles.toolText, textStyle, active && styles.toolTextActive]}>{text}</Text>}
  </Pressable>;
}

const styles = StyleSheet.create({
  editor: { gap: 8 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: 4, borderWidth: 1, borderColor: palette.border, borderRadius: 12, backgroundColor: '#f6f9f7' },
  tool: { minWidth: 44, height: 44, paddingHorizontal: 8, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  toolActive: { backgroundColor: palette.green },
  toolDim: { opacity: 0.5 },
  toolText: { color: palette.ink, fontSize: 17, fontWeight: '700' },
  toolTextActive: { color: '#fff' },
  toolBold: { fontWeight: '900' },
  toolItalic: { fontStyle: 'italic', fontFamily: 'serif' },
  toolSpacer: { flex: 1 },
  preview: { minHeight: 220, padding: 14, borderWidth: 1, borderColor: palette.border, borderRadius: 12, backgroundColor: '#fff' },
  body: { minHeight: 260, padding: 12, borderWidth: 1, borderColor: palette.border, borderRadius: 12, backgroundColor: '#fff', color: palette.ink, fontSize: 15, lineHeight: 22, textAlignVertical: 'top' },
  groupTitle: { marginTop: 6, color: palette.ink, fontSize: 15, fontWeight: '800' },
  source: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderWidth: 1, borderColor: palette.border, borderRadius: 12, backgroundColor: '#fff' },
  sourceChecked: { borderColor: '#9cc4ae', backgroundColor: palette.greenSoft },
  sourceText: { flex: 1, color: palette.ink, fontSize: 13, lineHeight: 19 },
});
