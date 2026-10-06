// The article text format shared with the phone app's offline Library:
// "## heading", "- bullet", "1. step" and "[[image:file]]" lines, with
// **bold**, *italic* and ***both*** inside a line. The admin editor converts
// between this text and editable HTML; farmers only ever receive the text.

export const ARTICLE_IMAGE_LINE = /^\[\[image:([^\]]+)\]\]$/;
const INLINE_MARK = /(\*{1,3})([^*\s](?:[^*]*[^*\s])?)\1/g;

export const numberedLineText = (line) => /^\d+[.)]\s+(.*)$/.exec(line)?.[1] ?? null;

/** Splits one line on its bold and italic marks. */
export function parseInline(text) {
  const spans = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_MARK)) {
    if (match.index > last) spans.push({ text: text.slice(last, match.index), bold: false, italic: false });
    const marks = match[1].length;
    spans.push({ text: match[2], bold: marks >= 2, italic: marks !== 2 });
    last = match.index + match[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last), bold: false, italic: false });
  return spans;
}

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const inlineHtml = (text) => parseInline(text).map(({ text: part, bold, italic }) => {
  let html = escapeHtml(part);
  if (italic) html = `<em>${html}</em>`;
  if (bold) html = `<strong>${html}</strong>`;
  return html;
}).join('');

export const photoPlaceholderCaption = 'Add a caption under Photos';

export function photoFigureHtml(photo, imageUrl) {
  return `<figure contenteditable="false" data-file="${escapeHtml(photo.file)}"><img src="${escapeHtml(imageUrl(photo))}" alt=""><figcaption>${escapeHtml(photo.caption || photoPlaceholderCaption)}</figcaption></figure>`;
}

/** Editable HTML for the article text. Photo lines for unknown files are dropped. */
export function bodyToHtml(body, images, imageUrl) {
  const html = [];
  let list = null;
  const openList = (tag) => { if (list !== tag) { closeList(); html.push(`<${tag}>`); list = tag; } };
  const closeList = () => { if (list) { html.push(`</${list}>`); list = null; } };
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const placed = ARTICLE_IMAGE_LINE.exec(line);
    const numbered = numberedLineText(line);
    if (placed) {
      closeList();
      const photo = images.find((item) => item.file === placed[1].trim());
      if (photo) html.push(photoFigureHtml(photo, imageUrl));
    } else if (line.startsWith('## ')) { closeList(); html.push(`<h3>${inlineHtml(line.slice(3))}</h3>`); }
    else if (line.startsWith('- ')) { openList('ul'); html.push(`<li>${inlineHtml(line.slice(2))}</li>`); }
    else if (numbered !== null) { openList('ol'); html.push(`<li>${inlineHtml(numbered)}</li>`); }
    else { closeList(); html.push(`<p>${inlineHtml(line)}</p>`); }
  }
  closeList();
  return html.join('') || '<p><br></p>';
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'FIGURE', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH']);
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'META', 'LINK', 'TITLE', 'IMG', 'SVG', 'BUTTON', 'INPUT']);

function styleFlags(element, bold, italic) {
  // Google Docs wraps pasted text in <b style="font-weight:normal">, so the style wins over the tag.
  let isBold = bold || element.tagName === 'B' || element.tagName === 'STRONG';
  let isItalic = italic || element.tagName === 'I' || element.tagName === 'EM';
  const weight = element.style?.fontWeight;
  if (weight) isBold = weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
  const fontStyle = element.style?.fontStyle;
  if (fontStyle) isItalic = fontStyle === 'italic' || fontStyle === 'oblique';
  return [isBold, isItalic];
}

/** Text of inline nodes with bold and italic written as marks; "\n" where a line break was. */
function inlineMarkdown(nodes, { skipLists = false } = {}) {
  const runs = [];
  const walk = (node, bold, italic) => {
    if (node.nodeType === 3) { runs.push({ text: node.nodeValue.replace(/\s+/g, ' '), bold, italic }); return; }
    if (node.nodeType !== 1 || SKIPPED_TAGS.has(node.tagName)) return;
    if (node.tagName === 'BR') { runs.push({ text: '\n', bold: false, italic: false }); return; }
    if (skipLists && (node.tagName === 'UL' || node.tagName === 'OL')) return;
    const [isBold, isItalic] = styleFlags(node, bold, italic);
    // A block nested in a heading or list item still starts a new line.
    const block = BLOCK_TAGS.has(node.tagName);
    if (block) runs.push({ text: '\n', bold: false, italic: false });
    node.childNodes.forEach((child) => walk(child, isBold, isItalic));
    if (block) runs.push({ text: '\n', bold: false, italic: false });
  };
  nodes.forEach((node) => walk(node, false, false));
  const merged = [];
  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (previous && previous.bold === run.bold && previous.italic === run.italic) previous.text += run.text;
    else merged.push({ ...run });
  }
  return merged.map(({ text, bold, italic }) => {
    const mark = bold && italic ? '***' : bold ? '**' : italic ? '*' : '';
    if (!mark) return text;
    // Spaces and line breaks stay outside the marks, so "**word **" never happens.
    return text.split('\n').map((piece) => {
      const core = piece.trim();
      if (!core) return piece;
      const lead = piece.slice(0, piece.length - piece.trimStart().length);
      const trail = piece.slice(piece.trimEnd().length);
      return `${lead}${mark}${core}${mark}${trail}`;
    }).join('\n');
  }).join('');
}

/** The article text for the editor's HTML (or HTML pasted from Word or a web page). */
export function htmlToBody(root) {
  const blocks = [];
  const pushParagraphs = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean).forEach((line) => blocks.push({ text: line, kind: 'p' }));
  const oneLine = (nodes, options) => inlineMarkdown(nodes, options).replace(/\s*\n\s*/g, ' ').trim();
  const walkList = (list, ordered) => {
    let step = 0;
    list.childNodes.forEach((item) => {
      if (item.nodeType !== 1) return;
      if (item.tagName === 'UL' || item.tagName === 'OL') { walkList(item, item.tagName === 'OL'); return; }
      const text = oneLine([...item.childNodes], { skipLists: true });
      if (text) { step += 1; blocks.push({ text: ordered ? `${step}. ${text}` : `- ${text}`, kind: ordered ? 'ol' : 'ul' }); }
      item.querySelectorAll?.(':scope > ul, :scope > ol').forEach((nested) => walkList(nested, nested.tagName === 'OL'));
    });
  };
  const walk = (parent) => {
    let inline = [];
    const flush = () => { if (inline.length) { pushParagraphs(inlineMarkdown(inline)); inline = []; } };
    parent.childNodes.forEach((node) => {
      // Google Docs wraps whole paragraphs in one inline <b>; treat such wrappers as containers.
      const wrapsBlocks = node.nodeType === 1 && !BLOCK_TAGS.has(node.tagName) && [...node.querySelectorAll('*')].some((child) => BLOCK_TAGS.has(child.tagName));
      if (node.nodeType === 3 || (node.nodeType === 1 && !BLOCK_TAGS.has(node.tagName) && !wrapsBlocks)) { inline.push(node); return; }
      if (node.nodeType !== 1) return;
      flush();
      const tag = node.tagName;
      if (tag === 'FIGURE') { if (node.dataset?.file) blocks.push({ text: `[[image:${node.dataset.file}]]`, kind: 'photo' }); }
      // Headings pasted from Word are often bold as a whole; they are bold anyway.
      else if (/^H[1-6]$/.test(tag)) {
        inlineMarkdown([...node.childNodes]).split('\n').map((line) => line.trim().replace(/^(\*{1,3})([^*]+)\1$/, '$2')).filter(Boolean)
          .forEach((text) => blocks.push({ text: `## ${text}`, kind: 'h' }));
      }
      else if (tag === 'UL' || tag === 'OL') walkList(node, tag === 'OL');
      else if (tag === 'LI') { const text = oneLine([...node.childNodes], { skipLists: true }); if (text) blocks.push({ text: `- ${text}`, kind: 'ul' }); }
      else walk(node);
    });
    flush();
  };
  walk(root);
  return blocks.map((block, index) => {
    const previous = blocks[index - 1];
    const separator = !previous ? '' : previous.kind === block.kind && (block.kind === 'ul' || block.kind === 'ol') ? '\n' : '\n\n';
    return separator + block.text;
  }).join('');
}
