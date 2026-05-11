import type { WardrobeCategory, WardrobeItem } from '@/types/wardrobe';

export type OutfitSuggestion = {
  tops: string[];
  bottoms: string[];
  accessories: string[];
  reason: string;
};

function label(item: WardrobeItem): string {
  return (item.title || item.type || item.code).trim();
}

function scoreItem(
  item: WardrobeItem,
  {
    hasWork,
    hasDate,
    isCold,
    isRaining,
  }: {
    hasWork: boolean;
    hasDate: boolean;
    isCold: boolean;
    isRaining: boolean;
  }
): number {
  const text = `${item.type} ${item.title ?? ''}`.toLowerCase();
  let score = 0;

  if (hasWork && /\b(blazer|jacket|coat|turtleneck|shirt|button|trouser|pant|skirt|belt|bag)\b/.test(text)) {
    score += 4;
  }
  if (hasDate && /\b(dress|skirt|satin|silk|bag|belt|coat|jacket|top|sweater)\b/.test(text)) {
    score += 4;
  }
  if (isCold && /\b(coat|jacket|sweater|turtleneck|scarf|wool|knit)\b/.test(text)) {
    score += 3;
  }
  if (isRaining && /\b(coat|jacket|hat|boot|bag|scarf)\b/.test(text)) {
    score += 2;
  }
  if (/\b(top|shirt|tee|dress|pant|trouser|jean|skirt|bag|belt|scarf|hat)\b/.test(text)) {
    score += 1;
  }

  return score;
}

function pickByCategory(
  items: WardrobeItem[],
  category: WardrobeCategory,
  limit: number,
  context: Parameters<typeof scoreItem>[1]
): WardrobeItem[] {
  return items
    .filter((item) => item.category === category)
    .map((item, index) => ({ item, index, score: scoreItem(item, context) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ item }) => item);
}

export function buildFallbackSuggestion(
  userPrompt: string,
  temp: number,
  condition: string,
  wardrobeItems: WardrobeItem[] = []
): OutfitSuggestion {
  const hasWork = userPrompt.toLowerCase().includes("work");
  const hasDate = userPrompt.toLowerCase().includes("date");
  const isCold = temp < 15;
  const isRaining = condition.toLowerCase().includes("rain");
  const context = { hasWork, hasDate, isCold, isRaining };
  const usableItems = wardrobeItems.filter((item) => item.code && item.type && item.category);

  if (usableItems.length === 0) {
    return {
      tops: [],
      bottoms: [],
      accessories: [],
      reason: "I do not see wardrobe items in your closet yet, so I cannot pick owned pieces. Add a few items and I will build suggestions from them.",
    };
  }

  const tops = pickByCategory(usableItems, 'tops', 3, context);
  const bottoms = pickByCategory(usableItems, 'bottoms', 2, context);
  const accessories = pickByCategory(usableItems, 'accessories', 2, context);
  const firstTop = tops[0];
  const firstBottom = bottoms[0];
  const firstAccessory = accessories[0];
  const primaryPiece = firstTop ?? firstBottom ?? firstAccessory;

  if (hasWork && hasDate) {
    return {
      tops: tops.map((item) => item.code),
      bottoms: bottoms.map((item) => item.code),
      accessories: accessories.map((item) => item.code),
      reason: `For work-to-date transition, start with ${primaryPiece ? label(primaryPiece) : 'one reliable closet piece'} and keep the outfit polished but flexible. ${isRaining ? "Prioritize your most weather-ready layer." : "Keep accessories minimal for flexibility."}`,
    };
  }

  if (hasWork) {
    return {
      tops: tops.map((item) => item.code),
      bottoms: bottoms.map((item) => item.code),
      accessories: accessories.map((item) => item.code),
      reason: `Professional and clean styling for work using pieces already in your wardrobe. ${isCold ? "Choose your warmest available layer." : "Use lighter pieces for comfort."}`,
    };
  }

  if (hasDate) {
    return {
      tops: tops.map((item) => item.code),
      bottoms: bottoms.map((item) => item.code),
      accessories: accessories.map((item) => item.code),
      reason: `Date-night ready styling with your own closet pieces. ${isCold ? "Add your warmest soft layer." : "A lighter top keeps the look relaxed."}`,
    };
  }

  return {
    tops: tops.map((item) => item.code),
    bottoms: bottoms.map((item) => item.code),
    accessories: accessories.map((item) => item.code),
    reason: "Casual and comfortable look built from pieces currently in your wardrobe.",
  };
}
