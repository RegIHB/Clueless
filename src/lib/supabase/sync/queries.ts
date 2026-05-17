import type { SupabaseClient } from '@supabase/supabase-js';
import type { SavedOutfit, WardrobeItem } from '@/types/wardrobe';
import {
  type SavedOutfitRowV2,
  type WardrobeRowV2,
  rowToSavedOutfit,
  rowToWardrobeItem,
} from '@/lib/supabase/sync/mappers';
import { fail, ok, SyncError, type SyncResult } from '@/lib/supabase/sync/errors';
import { readFromV2 } from '@/lib/supabase/sync-feature-flags';

const wardrobeSelectCols =
  'id, user_id, client_item_id, type, category, image_url, title, source_url, attribution, sort_order, version, deleted_at, created_at, updated_at';

const outfitsSelectCols =
  'id, user_id, client_outfit_id, tops_client_item_id, bottoms_client_item_id, outerwear_client_item_id, footwear_client_item_id, accessories_client_item_id, snapshot, version, deleted_at, saved_at, created_at, updated_at';

export async function fetchWardrobeV2(
  supabase: SupabaseClient,
  userId: string
): Promise<SyncResult<WardrobeItem[]>> {
  const { data, error } = await supabase
    .from('wardrobe_items_v2')
    .select(wardrobeSelectCols)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return fail(new SyncError('unavailable', error.message, error));
  }
  return ok((data as WardrobeRowV2[]).map(rowToWardrobeItem));
}

export async function fetchSavedOutfitsV2(
  supabase: SupabaseClient,
  userId: string
): Promise<SyncResult<SavedOutfit[]>> {
  const { data, error } = await supabase
    .from('saved_outfits_v2')
    .select(outfitsSelectCols)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('saved_at', { ascending: false });

  if (error) {
    return fail(new SyncError('unavailable', error.message, error));
  }
  return ok((data as SavedOutfitRowV2[]).map(rowToSavedOutfit));
}

/**
 * One-shot canonical sync read. Returns wardrobe + outfits + sync metadata.
 * Used by the sync API route so a single network round-trip rehydrates the app.
 */
export async function fetchCanonicalSync(
  supabase: SupabaseClient,
  userId: string
): Promise<SyncResult<{ items: WardrobeItem[]; outfits: SavedOutfit[]; lastFullSyncAt: string }>> {
  if (!readFromV2()) {
    return fail(new SyncError('unavailable', 'v2 reads disabled'));
  }
  const [wardrobe, outfits] = await Promise.all([
    fetchWardrobeV2(supabase, userId),
    fetchSavedOutfitsV2(supabase, userId),
  ]);
  if (!wardrobe.ok) return wardrobe;
  if (!outfits.ok) return outfits;

  const now = new Date().toISOString();
  await supabase
    .from('user_sync_state')
    .upsert({ user_id: userId, last_full_sync_at: now, schema_version: 2 }, { onConflict: 'user_id' });

  return ok({ items: wardrobe.value, outfits: outfits.value, lastFullSyncAt: now });
}
