// Toolbar edits for the article text format the Library reads:
// "## heading", "- bullet", "1. step", "[[image:file]]", **bold** and *italic*.

export type Selection = { start: number; end: number };
export type Edit = { text: string; selection: Selection };
export type LineKind = 'heading' | 'bullet' | 'numbered';

const LINE_PREFIX = /^(## |- |\d+[.)] )/;

function kindOf(line: string): LineKind | null {
  if (line.startsWith('## ')) return 'heading';
  if (line.startsWith('- ')) return 'bullet';
  return /^\d+[.)] /.test(line) ? 'numbered' : null;
}

function isWrapped(text: string, start: number, end: number, mark: string) {
  if (text.slice(start - mark.length, start) !== mark || text.slice(end, end + mark.length) !== mark) return false;
  if (mark !== '*') return true;
  // A lone "*" beside "**" belongs to bold; "***" is bold and italic.
  const before = /\*+$/.exec(text.slice(0, start))?.[0].length ?? 0;
  const after = /^\*+/.exec(text.slice(end))?.[0].length ?? 0;
  return before === after && before !== 2;
}

/** Wraps the selection in a mark ("**" or "*"), or removes it when already wrapped. */
export function toggleInlineMark(text: string, { start, end }: Selection, mark: string): Edit {
  const size = mark.length;
  if (isWrapped(text, start, end, mark)) {
    return { text: text.slice(0, start - size) + text.slice(start, end) + text.slice(end + size), selection: { start: start - size, end: end - size } };
  }
  const selected = text.slice(start, end);
  // Keep spaces the person selected outside the marks, so "**word **" never happens.
  const lead = selected.length - selected.trimStart().length;
  const trail = selected.length - selected.trimEnd().length;
  const inner = selected.trim();
  const next = text.slice(0, start) + selected.slice(0, lead) + mark + inner + mark + selected.slice(selected.length - trail) + text.slice(end);
  const innerStart = start + lead + size;
  return { text: next, selection: { start: innerStart, end: innerStart + inner.length } };
}

/** Turns every line the selection touches into a heading, bullet or numbered step; again turns it back. */
export function toggleLineKind(text: string, { start, end }: Selection, kind: LineKind): Edit {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  // A selection ending just after a line break does not include the next line.
  const newline = text.indexOf('\n', end > start && text[end - 1] === '\n' ? end - 1 : end);
  const to = newline === -1 ? text.length : newline;
  const lines = text.slice(from, to).split('\n');
  const removing = lines.filter((line) => line.trim()).every((line) => kindOf(line) === kind);
  let step = 0;
  const changed = lines.map((line) => {
    if (!line.trim() && lines.length > 1) return line;
    const plain = line.replace(LINE_PREFIX, '');
    if (removing) return plain;
    step += 1;
    return `${kind === 'heading' ? '## ' : kind === 'bullet' ? '- ' : `${step}. `}${plain}`;
  }).join('\n');
  const next = text.slice(0, from) + changed + text.slice(to);
  const cursor = from + changed.length;
  return { text: next, selection: { start: cursor, end: cursor } };
}

/** Puts a block line, such as "[[image:file]]", on its own line at the cursor. */
export function insertBlockLine(text: string, { end }: Selection, block: string): Edit {
  const lineEnd = text.indexOf('\n', end);
  const at = lineEnd === -1 ? text.length : lineEnd;
  const before = text.slice(0, at).replace(/\s+$/, '');
  const after = text.slice(at).replace(/^\s+/, '');
  const head = before ? `${before}\n\n` : '';
  const next = `${head}${block}\n${after ? `\n${after}` : ''}`;
  const cursor = head.length + block.length + 1;
  return { text: next, selection: { start: cursor, end: cursor } };
}
