import { describe, expect, it } from 'vitest';
import {
  retrieveWardrobeContextWithFallback,
  preferenceKeywords,
  outfitSuggestionFromRag,
} from '@/lib/stylist-rag';
import type { WardrobeItem } from '@/types/wardrobe';

const wardrobe: WardrobeItem[] = [
  { code: 'top-1', category: 'tops', type: 'White Oxford Shirt', title: 'Oxford' },
  { code: 'top-2', category: 'tops', type: 'Black Hoodie', title: 'Street Hoodie' },
  { code: 'bot-1', category: 'bottoms', type: 'Tailored Trousers', title: 'Grey Trousers' },
  { code: 'out-1', category: 'outerwear', type: 'Wool Coat', title: 'Navy Coat' },
  { code: 'shoe-1', category: 'footwear', type: 'White Sneakers' },
  { code: 'acc-1', category: 'accessories', type: 'Leather Belt' },
];

describe('stylist RAG', () => {
  it('boosts work-appropriate pieces for office queries', () => {
    const rag = retrieveWardrobeContextWithFallback(
      'I have a work meeting today, smart but comfortable',
      wardrobe,
      { styleVibe: 'classic', colorPalette: 'neutrals', notes: '' },
      { temp: 10, condition: 'Cloudy' },
      'Berlin',
      []
    );

    const codes = rag.items.map((r) => r.item.code);
    expect(codes).toContain('top-1');
    expect(codes).toContain('bot-1');
    expect(rag.occasionHints).toContain('work');
  });

  it('uses preference keywords for streetwear vibe', () => {
    const words = preferenceKeywords({ styleVibe: 'streetwear', colorPalette: 'no-preference' });
    expect(words).toContain('streetwear');
    expect(words).toContain('sneakers');

    const rag = retrieveWardrobeContextWithFallback(
      'casual fit for hanging out',
      wardrobe,
      { styleVibe: 'streetwear', colorPalette: 'no-preference' },
      { temp: 18, condition: 'Clear' },
      'London',
      []
    );

    const codes = rag.items.map((r) => r.item.code);
    expect(codes).toContain('top-2');
  });

  it('builds outfit suggestion from retrieved categories', () => {
    const rag = retrieveWardrobeContextWithFallback(
      'date night outfit',
      wardrobe,
      null,
      { temp: 12, condition: 'Clear' },
      'Paris',
      []
    );
    const outfit = outfitSuggestionFromRag(rag, 'Test.');
    expect(outfit.tops.length).toBeGreaterThan(0);
    expect(outfit.reason).toContain('Test.');
  });

  it('expands query with recent history', () => {
    const rag = retrieveWardrobeContextWithFallback(
      'something warmer',
      wardrobe,
      null,
      { temp: 5, condition: 'Snow' },
      'Oslo',
      [{ role: 'user', content: 'I need an outfit for work in the cold' }]
    );
    expect(rag.expandedQuery.toLowerCase()).toContain('work');
    expect(rag.items.some((r) => r.item.category === 'outerwear')).toBe(true);
  });
});
