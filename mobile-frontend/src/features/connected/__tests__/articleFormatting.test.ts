import { insertBlockLine, toggleInlineMark, toggleLineKind } from '../articleFormatting';

describe('article toolbar edits', () => {
  it('wraps a selection in bold and unwraps it again', () => {
    const bold = toggleInlineMark('Cut the leaf', { start: 4, end: 7 }, '**');
    expect(bold.text).toBe('Cut **the** leaf');
    expect(bold.selection).toEqual({ start: 6, end: 9 });
    expect(toggleInlineMark(bold.text, bold.selection, '**').text).toBe('Cut the leaf');
  });

  it('keeps selected spaces outside the marks', () => {
    expect(toggleInlineMark('Cut the leaf', { start: 3, end: 8 }, '*').text).toBe('Cut *the* leaf');
  });

  it('does not treat bold marks as italic', () => {
    const text = 'Cut **the** leaf';
    expect(toggleInlineMark(text, { start: 6, end: 9 }, '*').text).toBe('Cut ***the*** leaf');
  });

  it('turns the current line into a heading and back', () => {
    const heading = toggleLineKind('Intro\nWhy it helps\nMore', { start: 8, end: 8 }, 'heading');
    expect(heading.text).toBe('Intro\n## Why it helps\nMore');
    expect(toggleLineKind(heading.text, { start: 10, end: 10 }, 'heading').text).toBe('Intro\nWhy it helps\nMore');
  });

  it('numbers every selected line and swaps bullets for numbers', () => {
    expect(toggleLineKind('- Wash tools\n- Burn leaves', { start: 0, end: 25 }, 'numbered').text).toBe('1. Wash tools\n2. Burn leaves');
  });

  it('places a photo on its own line after the cursor line', () => {
    const placed = insertBlockLine('First line\nSecond line', { start: 3, end: 3 }, '[[image:a.webp]]');
    expect(placed.text).toBe('First line\n\n[[image:a.webp]]\n\nSecond line');
    expect(insertBlockLine('', { start: 0, end: 0 }, '[[image:a.webp]]').text).toBe('[[image:a.webp]]\n');
  });
});
