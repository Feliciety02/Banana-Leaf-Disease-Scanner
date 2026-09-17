export function normalizeChatText(value = '') {
  const text = String(value ?? '');
  const cleaned = text
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/(^|\n)(?:[-*+]\s+)/g, '$1• ')
    .replace(/(^|\n)\s*#{1,6}\s*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/(^|\n)\s*>\s?/g, '$1')
    .replace(/\*\*+/g, '')
    .replace(/__+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+\n/g, '\n')
    .trim();

  const lines = cleaned.split('\n');
  const normalized = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    const isBullet = /^•\s+/.test(trimmed);

    if (isBullet && normalized.length > 0 && normalized[normalized.length - 1].trim() && !/^•\s+/.test(normalized[normalized.length - 1])) {
      normalized.push('');
    }

    normalized.push(trimmed);
  });

  return normalized.join('\n').trim();
}
