const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'it',
  'i', 'me', 'my', 'we', 'you', 'your', 'with', 'have', 'has', 'be', 'am', 'are', 'was',
  'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should', 'just', 'so', 'that',
  'this', 'what', 'how', 'when', 'where', 'who', 'from', 'about', 'into', 'than', 'then',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function uniqueTokens(texts: string[]): Set<string> {
  const out = new Set<string>();
  for (const text of texts) {
    for (const t of tokenize(text)) out.add(t);
  }
  return out;
}
