import type { WardrobeCategory, WardrobeItem } from '@/types/wardrobe';
import type { ProfilePreferences } from '@/lib/supabase/sync';

export type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type StylistWeather = {
  temp: number;
  condition: string;
};

export type RetrievedWardrobeItem = {
  item: WardrobeItem;
  score: number;
  reasons: string[];
};

export type RagRetrievalResult = {
  query: string;
  expandedQuery: string;
  items: RetrievedWardrobeItem[];
  byCategory: Partial<Record<WardrobeCategory, RetrievedWardrobeItem[]>>;
  preferenceSummary: string;
  occasionHints: string[];
};

export type { ProfilePreferences as StylePreferences };
