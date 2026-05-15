export type WardrobeCategory = 'tops' | 'bottoms' | 'outerwear' | 'footwear' | 'accessories';

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
  outerwear?: WardrobeItem;
  footwear?: WardrobeItem;
  accessories?: WardrobeItem;
  savedAt: Date;
}
