import type { WardrobeCategory, WardrobeItem } from '@/types/wardrobe';
import type { ProfilePreferences } from '@/lib/supabase/sync';
import { formatPreferenceProfile, preferenceKeywords } from './preferences';
import { tokenize, uniqueTokens } from './tokenize';
import { detectOccasion, type OccasionContext } from './occasion';
import type { ChatTurn, RagRetrievalResult, RetrievedWardrobeItem, StylistWeather } from './types';

const CATEGORY_LIMITS: Record<WardrobeCategory, number> = {
  tops: 4,
  bottoms: 3,
  outerwear: 2,
  footwear: 2,
  accessories: 3,
};

const TOTAL_CAP = 18;

function itemSearchText(item: WardrobeItem): string {
  return `${item.code} ${item.category} ${item.type} ${item.title ?? ''}`.toLowerCase();
}

function overlapScore(docTokens: string[], queryTokens: Set<string>): number {
  if (queryTokens.size === 0) return 0;
  let hits = 0;
  for (const t of docTokens) {
    if (queryTokens.has(t)) hits += 1;
  }
  return hits / Math.sqrt(queryTokens.size);
}

function occasionBoost(text: string, occasion: OccasionContext): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (occasion.hasWork && /\b(blazer|jacket|coat|shirt|button|trouser|pant|skirt|belt|bag|blouse|oxford)\b/.test(text)) {
    score += 3;
    reasons.push('work-appropriate');
  }
  if (occasion.hasDate && /\b(dress|skirt|satin|silk|heel|bag|coat|blouse|top|sweater)\b/.test(text)) {
    score += 3;
    reasons.push('date-ready');
  }
  if (occasion.hasFormal && /\b(blazer|suit|dress|heel|loafer|coat|tie|shirt)\b/.test(text)) {
    score += 3;
    reasons.push('formal');
  }
  if (occasion.hasGym && /\b(legging|short|tee|tank|sneaker|trainer|jogger|sport)\b/.test(text)) {
    score += 3;
    reasons.push('active');
  }
  if (occasion.isCold && /\b(coat|jacket|sweater|knit|wool|scarf|boot|layer|turtleneck)\b/.test(text)) {
    score += 2.5;
    reasons.push('warm layer');
  }
  if (occasion.isHot && /\b(tee|tank|linen|short|sandal|light|breathable)\b/.test(text)) {
    score += 2;
    reasons.push('breathable');
  }
  if (occasion.isRaining && /\b(coat|jacket|boot|rain|waterproof|hood)\b/.test(text)) {
    score += 2;
    reasons.push('weather-ready');
  }

  return { score, reasons };
}

function preferenceBoost(text: string, prefWords: string[]): { score: number; reasons: string[] } {
  if (prefWords.length === 0) return { score: 0, reasons: [] };
  let score = 0;
  const reasons: string[] = [];
  for (const w of prefWords) {
    const token = w.toLowerCase();
    if (token.length < 3) continue;
    if (text.includes(token)) {
      score += 1.2;
      if (reasons.length < 2) reasons.push(`matches ${token}`);
    }
  }
  return { score, reasons };
}

function expandQuery(
  message: string,
  history: ChatTurn[],
  weather: StylistWeather,
  location: string
): string {
  const recentUser = history
    .filter((t) => t.role === 'user')
    .slice(-3)
    .map((t) => t.content)
    .join(' ');
  return [message, recentUser, location, `${weather.temp}c`, weather.condition].filter(Boolean).join(' ');
}

function scoreItem(
  item: WardrobeItem,
  queryTokens: Set<string>,
  prefWords: string[],
  occasion: OccasionContext
): RetrievedWardrobeItem {
  const text = itemSearchText(item);
  const docTokens = tokenize(text);
  const lexical = overlapScore(docTokens, queryTokens) * 4;
  const occ = occasionBoost(text, occasion);
  const pref = preferenceBoost(text, prefWords);
  const score = lexical + occ.score + pref.score;
  const reasons = [...occ.reasons, ...pref.reasons];
  if (lexical > 1.5) reasons.push('matches your question');
  return { item, score, reasons: [...new Set(reasons)].slice(0, 4) };
}

export function retrieveWardrobeContext(
  message: string,
  wardrobeItems: WardrobeItem[],
  prefs: ProfilePreferences | null | undefined,
  weather: StylistWeather,
  location: string,
  history: ChatTurn[] = []
): RagRetrievalResult {
  const expandedQuery = expandQuery(message, history, weather, location);
  const queryTokens = uniqueTokens([expandedQuery]);
  const prefWords = preferenceKeywords(prefs);
  const occasion = detectOccasion(expandedQuery, weather.temp, weather.condition);

  const usable = wardrobeItems.filter((i) => i.code && i.type && i.category);
  const scored = usable
    .map((item) => scoreItem(item, queryTokens, prefWords, occasion))
    .filter((r) => r.score > 0.15)
    .sort((a, b) => b.score - a.score);

  const byCategory: Partial<Record<WardrobeCategory, RetrievedWardrobeItem[]>> = {};
  const picked: RetrievedWardrobeItem[] = [];
  const categories: WardrobeCategory[] = ['tops', 'bottoms', 'outerwear', 'footwear', 'accessories'];

  for (const cat of categories) {
    const limit = CATEGORY_LIMITS[cat];
    const catItems = scored.filter((r) => r.item.category === cat).slice(0, limit);
    if (catItems.length > 0) byCategory[cat] = catItems;
    picked.push(...catItems);
  }

  if (picked.length < 6) {
    for (const row of scored) {
      if (picked.length >= TOTAL_CAP) break;
      if (picked.some((p) => p.item.code === row.item.code)) continue;
      picked.push(row);
    }
  }

  const items = picked.slice(0, TOTAL_CAP);

  return {
    query: message,
    expandedQuery,
    items,
    byCategory,
    preferenceSummary: formatPreferenceProfile(prefs),
    occasionHints: occasion.labels,
  };
}

/** When retrieval is sparse, include top items per category anyway. */
export function retrieveWardrobeContextWithFallback(
  message: string,
  wardrobeItems: WardrobeItem[],
  prefs: ProfilePreferences | null | undefined,
  weather: StylistWeather,
  location: string,
  history: ChatTurn[] = []
): RagRetrievalResult {
  const primary = retrieveWardrobeContext(message, wardrobeItems, prefs, weather, location, history);
  if (primary.items.length >= 4) return primary;

  const expandedQuery = expandQuery(message, history, weather, location);
  const queryTokens = uniqueTokens([expandedQuery]);
  const prefWords = preferenceKeywords(prefs);
  const occasion = detectOccasion(expandedQuery, weather.temp, weather.condition);
  const usable = wardrobeItems.filter((i) => i.code && i.type && i.category);

  const allScored = usable
    .map((item) => scoreItem(item, queryTokens, prefWords, occasion))
    .sort((a, b) => b.score - a.score);

  const byCategory: Partial<Record<WardrobeCategory, RetrievedWardrobeItem[]>> = { ...primary.byCategory };
  const pickedCodes = new Set(primary.items.map((r) => r.item.code));
  const merged = [...primary.items];

  for (const cat of Object.keys(CATEGORY_LIMITS) as WardrobeCategory[]) {
    const have = byCategory[cat]?.length ?? 0;
    const need = Math.max(0, Math.min(CATEGORY_LIMITS[cat], 2) - have);
    if (need === 0) continue;
    const extras = allScored
      .filter((r) => r.item.category === cat && !pickedCodes.has(r.item.code))
      .slice(0, need);
    for (const e of extras) {
      pickedCodes.add(e.item.code);
      merged.push(e);
    }
    byCategory[cat] = [...(byCategory[cat] ?? []), ...extras];
  }

  return {
    ...primary,
    items: merged.slice(0, TOTAL_CAP),
    byCategory,
    preferenceSummary: formatPreferenceProfile(prefs),
  };
}
