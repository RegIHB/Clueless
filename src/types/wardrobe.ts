export type WardrobeCategory = 'tops' | 'bottoms' | 'accessories';

export interface WardrobeItem {
  code: string;
  type: string;
  category: WardrobeCategory;
  imageUrl?: string;
  title?: string;
  sourceUrl?: string;
  attribution?: string;
}

export interface SavedOutfit {
  id: string;
  tops?: WardrobeItem;
  bottoms?: WardrobeItem;
  accessories?: WardrobeItem;
  savedAt: Date;
}
