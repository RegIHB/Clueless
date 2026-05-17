import { describe, expect, test } from 'vitest';

type TryOnHistoryEntry = {
  id: string;
  createdAt: string;
  imageUrl: string;
  personImageUrl: string;
  garmentImageUrl: string;
};

function isValidTryOnHistoryEntry(row: unknown): row is TryOnHistoryEntry {
  if (!row || typeof row !== 'object') return false;
  const entry = row as TryOnHistoryEntry;
  if (typeof entry.id !== 'string' || entry.id.length === 0) return false;
  if (typeof entry.imageUrl !== 'string' || !entry.imageUrl.startsWith('http')) return false;
  if (typeof entry.createdAt !== 'string' || Number.isNaN(Date.parse(entry.createdAt))) return false;
  try {
    const parsed = new URL(entry.imageUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeTryOnHistory(value: unknown): TryOnHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isValidTryOnHistoryEntry);
}

describe('normalizeTryOnHistory', () => {
  test('drops malformed and partial rows', () => {
    const result = normalizeTryOnHistory([
      { id: 'a', createdAt: '2026-05-17T16:05:19.000Z', imageUrl: 'https://cdn.example.com/1.jpg', personImageUrl: '', garmentImageUrl: '' },
      { id: 'b', imageUrl: 'https://cdn.example.com/2.jpg' },
      { id: 'c', createdAt: 'not-a-date', imageUrl: 'https://cdn.example.com/3.jpg', personImageUrl: '', garmentImageUrl: '' },
      { id: 'd', createdAt: '2026-05-17T16:05:19.000Z', imageUrl: 'ftp://bad', personImageUrl: '', garmentImageUrl: '' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('a');
  });
});
