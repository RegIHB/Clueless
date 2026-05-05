import type { SavedOutfit, WardrobeCategory, WardrobeItem } from '@/types/wardrobe';

/** Strict size cap so URL columns never bloat the row beyond Postgres TOAST limits. */
export const MAX_TEXT_FIELD = 8000;
export const MAX_SNAPSHOT_URL = 2048;

export type WardrobeRowV2 = {
  id: string;
  user_id: string;
  client_item_id: string;
  type: string;
  category: string;
  image_url: string | null;
  title: string | null;
  source_url: string | null;
  attribution: string | null;
  sort_order: number;
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SavedOutfitRowV2 = {
  id: string;
  user_id: string;
  client_outfit_id: string;
  tops_client_item_id: string | null;
  bottoms_client_item_id: string | null;
  accessories_client_item_id: string | null;
  snapshot: {
    tops?: WardrobeItem;
    bottoms?: WardrobeItem;
    accessories?: WardrobeItem;
  };
  version: number;
  deleted_at: string | null;
  saved_at: string;
  created_at: string;
  updated_at: string;
};

export function rowToWardrobeItem(row: WardrobeRowV2): WardrobeItem {
  return {
    code: row.client_item_id,
    type: row.type,
    category: row.category as WardrobeCategory,
    ...(row.image_url ? { imageUrl: row.image_url } : {}),
    ...(row.title ? { title: row.title } : {}),
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
    ...(row.attribution ? { attribution: row.attribution } : {}),
  };
}

export function rowToSavedOutfit(row: SavedOutfitRowV2): SavedOutfit {
  return {
    id: row.id,
    tops: row.snapshot.tops,
    bottoms: row.snapshot.bottoms,
    accessories: row.snapshot.accessories,
    savedAt: new Date(row.saved_at),
  };
}

function imageUrlForDb(url?: string): string | null {
  if (!url) return null;
  if (url.startsWith('data:')) return null;
  return url.length > MAX_TEXT_FIELD ? url.slice(0, MAX_TEXT_FIELD) : url;
}

export function wardrobeItemToInsertRow(userId: string, item: WardrobeItem, sortOrder: number) {
  return {
    user_id: userId,
    client_item_id: item.code,
    type: item.type,
    category: item.category,
    image_url: imageUrlForDb(item.imageUrl),
    title: item.title?.slice(0, 500) ?? null,
    source_url: item.sourceUrl ? item.sourceUrl.slice(0, MAX_TEXT_FIELD) : null,
    attribution: item.attribution?.slice(0, 500) ?? null,
    sort_order: sortOrder,
  };
}

/** Slim outfit snapshot keeps DB rows small while preserving display data. */
export function slimWardrobeSnapshot(item: WardrobeItem | undefined): WardrobeItem | undefined {
  if (!item) return undefined;
  const slim: WardrobeItem = { code: item.code, type: item.type, category: item.category };
  if (item.title) slim.title = item.title.slice(0, 500);
  if (item.attribution) slim.attribution = item.attribution.slice(0, 500);
  if (item.sourceUrl && item.sourceUrl.length <= MAX_SNAPSHOT_URL) slim.sourceUrl = item.sourceUrl;
  if (item.imageUrl && !item.imageUrl.startsWith('data:') && item.imageUrl.length <= MAX_SNAPSHOT_URL) {
    slim.imageUrl = item.imageUrl;
  }
  return slim;
}
