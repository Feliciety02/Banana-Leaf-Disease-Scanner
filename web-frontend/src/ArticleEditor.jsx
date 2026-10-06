import { useCallback, useEffect, useRef, useState } from 'react';
import { Bold, Heading2, ImagePlus, Italic, List, ListOrdered, Redo2, RemoveFormatting, Undo2 } from 'lucide-react';

import { bodyToHtml, htmlToBody, photoFigureHtml, photoPlaceholderCaption } from './utils/articleFormat';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const shortcut = (key) => `${isMac ? '⌘' : 'Ctrl+'}${key}`;

/**
 * A word-processor style editor for article text. It edits HTML on screen but
 * always reports the plain article format (see utils/articleFormat), so the
 * phone app and its offline library keep reading the same text.
 * `controller.current.insertPhoto(photo)` places a photo where the cursor was.
 */
export function ArticleEditor({ value, images, imageUrl, onChange, onAddPhoto, uploading, controller, placeholder }) {
  const box = useRef(null);
  const emitted = useRef(null);
  const savedRange = useRef(null);
  const [active, setActive] = useState({});

  const emit = useCallback(() => {
    if (!box.current) return;
    const body = htmlToBody(box.current);
    emitted.current = body;
    box.current.dataset.empty = String(!body.trim());
    onChange(body);
  }, [onChange]);

  // Redraw only when the text changed outside the editor (opening another
  // article, removing a photo), so typing never moves the cursor.
  useEffect(() => {
    if (!box.current || value === emitted.current) return;
    box.current.innerHTML = bodyToHtml(value, images, imageUrl);
    box.current.dataset.empty = String(!value.trim());
    emitted.current = value;
  }, [value, images, imageUrl]);

  // Captions typed under Photos show on the photo inside the text.
  useEffect(() => {
    box.current?.querySelectorAll('figure[data-file]').forEach((figure) => {
      const caption = figure.querySelector('figcaption');
      const photo = images.find((item) => item.file === figure.dataset.file);
      if (caption && photo) caption.textContent = photo.caption || photoPlaceholderCaption;
    });
  }, [images]);

  const refreshActive = useCallback(() => {
    const block = String(document.queryCommandValue('formatBlock') || '').toLowerCase();
    setActive({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      ul: document.queryCommandState('insertUnorderedList'),
      ol: document.queryCommandState('insertOrderedList'),
      heading: /^h[1-6]$/.test(block),
    });
  }, []);

  useEffect(() => {
    const onSelection = () => {
      const selection = window.getSelection();
      if (!box.current || !selection?.rangeCount || !box.current.contains(selection.anchorNode)) return;
      savedRange.current = selection.getRangeAt(0).cloneRange();
      refreshActive();
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, [refreshActive]);

  const restoreSelection = () => {
    box.current.focus();
    const selection = window.getSelection();
    if (savedRange.current && box.current.contains(savedRange.current.startContainer)) {
      selection.removeAllRanges();
      selection.addRange(savedRange.current);
    }
  };

  const run = (command, argument) => {
    restoreSelection();
    document.execCommand('defaultParagraphSeparator', false, 'p');
    document.execCommand(command, false, argument);
    emit();
    refreshActive();
  };

  const toggleHeading = () => run('formatBlock', active.heading ? '<p>' : '<h3>');

  // A photo goes on its own line after the paragraph the cursor is in.
  const insertPhoto = useCallback((photo) => {
    if (!box.current) return;
    const template = document.createElement('template');
    template.innerHTML = photoFigureHtml(photo, imageUrl);
    const figure = template.content.firstChild;
    const live = window.getSelection();
    const anchor = live?.rangeCount && box.current.contains(live.anchorNode) ? live.anchorNode : savedRange.current?.startContainer;
    let block = anchor && box.current.contains(anchor) ? anchor : null;
    while (block && block.parentNode !== box.current) block = block.parentNode;
    if (block) block.after(figure); else box.current.append(figure);
    if (!figure.nextSibling) figure.after(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
    const range = document.createRange();
    range.setStart(figure.nextSibling, 0);
    savedRange.current = range;
    emit();
  }, [emit, imageUrl]);

  useEffect(() => {
    if (controller) controller.current = { insertPhoto };
  }, [controller, insertPhoto]);

  // Pasted text keeps headings, bold, italic and lists, and loses everything else.
  const paste = (event) => {
    event.preventDefault();
    const html = event.clipboardData.getData('text/html');
    const text = event.clipboardData.getData('text/plain');
    // DOMParser never runs scripts or loads images from pasted HTML.
    const body = html ? htmlToBody(new DOMParser().parseFromString(html, 'text/html').body) : text.replace(/\r/g, '').split(/\n+/).join('\n\n');
    if (!body.trim()) return;
    document.execCommand('insertHTML', false, bodyToHtml(body, images, imageUrl));
    emit();
  };

  const tools = [
    { label: `Undo (${shortcut('Z')})`, icon: Undo2, action: () => run('undo') },
    { label: `Redo (${shortcut('Y')})`, icon: Redo2, action: () => run('redo') },
    'divider',
    { label: 'Heading', icon: Heading2, action: toggleHeading, on: active.heading },
    { label: `Bold (${shortcut('B')})`, icon: Bold, action: () => run('bold'), on: active.bold },
    { label: `Italic (${shortcut('I')})`, icon: Italic, action: () => run('italic'), on: active.italic },
    'divider',
    { label: 'Bulleted list', icon: List, action: () => run('insertUnorderedList'), on: active.ul },
    { label: 'Numbered list', icon: ListOrdered, action: () => run('insertOrderedList'), on: active.ol },
    { label: 'Clear formatting', icon: RemoveFormatting, action: () => { run('removeFormat'); if (active.heading) run('formatBlock', '<p>'); } },
  ];

  return <div className="rich-editor">
    <div className="rich-editor-toolbar" role="toolbar" aria-label="Text formatting">
      {tools.map((tool, index) => tool === 'divider'
        ? <span key={index} className="rich-editor-divider" aria-hidden="true" />
        : <button key={tool.label} type="button" title={tool.label} aria-label={tool.label} aria-pressed={tool.on === undefined ? undefined : Boolean(tool.on)} className={tool.on ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={tool.action}><tool.icon size={18} /></button>)}
      <span className="rich-editor-divider" aria-hidden="true" />
      <label className={`rich-editor-photo${uploading ? ' disabled' : ''}`} title="Insert a photo where the cursor is" onMouseDown={() => restoreSelection()}>
        <ImagePlus size={18} /><span>{uploading ? 'Uploading…' : 'Photo'}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} hidden onChange={(event) => { onAddPhoto(event.target.files?.[0]); event.target.value = ''; }} />
      </label>
    </div>
    <div
      ref={box}
      className="rich-editor-page"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Article text"
      data-placeholder={placeholder}
      onInput={emit}
      onPaste={paste}
      onDrop={(event) => { if (event.dataTransfer?.files?.length) event.preventDefault(); }}
      onKeyUp={refreshActive}
      onMouseUp={refreshActive}
    />
  </div>;
}
