import type { SupabaseClient } from '@supabase/supabase-js';
import type { SavedOutfit, WardrobeItem } from '@/types/wardrobe';
import {
  type SavedOutfitRowV2,
  rowToSavedOutfit,
  slimWardrobeSnapshot,
  wardrobeItemToInsertRow,
} from '@/lib/supabase/sync/mappers';
import { dualWriteEnabled } from '@/lib/supabase/sync-feature-flags';
import { classifyPostgrestError, fail, ok, SyncError, type SyncResult } from '@/lib/supabase/sync/errors';

/** Look up a previous mutation result by client mutation id (idempotency). */
export async function findRecordedMutation(
  supabase: SupabaseClient,
  userId: string,
  mutationId: string
): Promise<SyncResult<{ kind: string; resultId: string | null } | null>> {
  const { data, error } = await supabase
    .from('client_mutation_log')
    .select('result_kind, result_id')
    .eq('user_id', userId)
    .eq('mutation_id', mutationId)
    .maybeSingle();

  if (error) return fail(new SyncError('unavailable', error.message, error));
  if (!data) return ok(null);
  return ok({ kind: data.result_kind, resultId: data.result_id ?? null });
}

async function recordMutation(
  supabase: SupabaseClient,
  userId: string,
  mutationId: string,
  resultKind: string,
  resultId: string | null
): Promise<void> {
  await supabase
    .from('client_mutation_log')
    .insert({ user_id: userId, mutation_id: mutationId, result_kind: resultKind, result_id: resultId })
    .select('mutation_id')
    .maybeSingle();
}

export async function upsertWardrobeItem(
  supabase: SupabaseClient,
  userId: string,
  item: WardrobeItem,
  sortOrder: number,
  mutationId?: string
): Promise<SyncResult<{ id: string; clientItemId: string }>> {
  if (mutationId) {
    const existing = await findRecordedMutation(supabase, userId, mutationId);
    if (existing.ok && existing.value && existing.value.kind === 'wardrobe_upsert') {
      return ok({ id: existing.value.resultId ?? '', clientItemId: item.code });
    }
  }

  const row = wardrobeItemToInsertRow(userId, item, sortOrder);
  const { data, error } = await supabase
    .from('wardrobe_items_v2')
    .upsert(row, { onConflict: 'user_id,client_item_id', ignoreDuplicates: false })
    .select('id, client_item_id')
    .single();

  if (error) {
    return fail(new SyncError(classifyPostgrestError(error.message, error.code), error.message, error));
  }

  if (dualWriteEnabled()) {
    await supabase
      .from('wardrobe_items')
      .upsert(
        {
          user_id: userId,
          code: item.code,
          type: item.type,
          category: item.category,
          image_url: row.image_url,
          title: row.title,
          source_url: row.source_url,
          attribution: row.attribution,
          sort_order: sortOrder,
        },
        { onConflict: 'user_id,code', ignoreDuplicates: false }
      );
  }

  if (mutationId) {
    await recordMutation(supabase, userId, mutationId, 'wardrobe_upsert', data.id as string);
  }

  return ok({ id: data.id as string, clientItemId: data.client_item_id as string });
}

export async function softDeleteWardrobeItem(
  supabase: SupabaseClient,
  userId: string,
  clientItemId: string,
  mutationId?: string
): Promise<SyncResult<true>> {
  if (mutationId) {
    const existing = await findRecordedMutation(supabase, userId, mutationId);
    if (existing.ok && existing.value && existing.value.kind === 'wardrobe_delete') {
      return ok(true);
    }
  }

  const { error } = await supabase
    .from('wardrobe_items_v2')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('client_item_id', clientItemId);

  if (error) {
    return fail(new SyncError(classifyPostgrestError(error.message, error.code), error.message, error));
  }

  if (dualWriteEnabled()) {
    await supabase
      .from('wardrobe_items')
      .delete()
      .eq('user_id', userId)
      .eq('code', clientItemId);
  }

  if (mutationId) {
    await recordMutation(supabase, userId, mutationId, 'wardrobe_delete', clientItemId);
  }

  return ok(true);
}

export async function bulkUpsertWardrobe(
  supabase: SupabaseClient,
  userId: string,
  items: WardrobeItem[],
  startSortOrder: number
): Promise<SyncResult<true>> {
  if (items.length === 0) return ok(true);
  const rows = items.map((item, idx) => wardrobeItemToInsertRow(userId, item, startSortOrder + idx));
  const { error } = await supabase
    .from('wardrobe_items_v2')
    .upsert(rows, { onConflict: 'user_id,client_item_id', ignoreDuplicates: true });
  if (error) {
    return fail(new SyncError(classifyPostgrestError(error.message, error.code), error.message, error));
  }
  return ok(true);
}

type OutfitInput = {
  clientOutfitId: string;
  tops?: WardrobeItem;
  bottoms?: WardrobeItem;
  accessories?: WardrobeItem;
  savedAt: Date;
  mutationId?: string;
};

export async function upsertSavedOutfit(
  supabase: SupabaseClient,
  userId: string,
  outfit: OutfitInput
): Promise<SyncResult<SavedOutfit>> {
  if (outfit.mutationId) {
    const existing = await findRecordedMutation(supabase, userId, outfit.mutationId);
    if (existing.ok && existing.value && existing.value.kind === 'outfit_upsert' && existing.value.resultId) {
      const fetched = await supabase
        .from('saved_outfits_v2')
        .select(
          'id, user_id, client_outfit_id, tops_client_item_id, bottoms_client_item_id, accessories_client_item_id, snapshot, version, deleted_at, saved_at, created_at, updated_at'
        )
        .eq('id', existing.value.resultId)
        .maybeSingle();
      if (fetched.data) {
        return ok(rowToSavedOutfit(fetched.data as SavedOutfitRowV2));
      }
    }
  }

  const row = {
    user_id: userId,
    client_outfit_id: outfit.clientOutfitId,
    tops_client_item_id: outfit.tops?.code ?? null,
    bottoms_client_item_id: outfit.bottoms?.code ?? null,
    accessories_client_item_id: outfit.accessories?.code ?? null,
    snapshot: {
      tops: slimWardrobeSnapshot(outfit.tops),
      bottoms: slimWardrobeSnapshot(outfit.bottoms),
      accessories: slimWardrobeSnapshot(outfit.accessories),
    },
    saved_at: outfit.savedAt.toISOString(),
  };

  const { data, error } = await supabase
    .from('saved_outfits_v2')
    .upsert(row, { onConflict: 'user_id,client_outfit_id', ignoreDuplicates: false })
    .select(
      'id, user_id, client_outfit_id, tops_client_item_id, bottoms_client_item_id, accessories_client_item_id, snapshot, version, deleted_at, saved_at, created_at, updated_at'
    )
    .single();

  if (error) {
    return fail(new SyncError(classifyPostgrestError(error.message, error.code), error.message, error));
  }

  const persisted = rowToSavedOutfit(data as SavedOutfitRowV2);

  if (dualWriteEnabled()) {
    await supabase.from('saved_outfits').insert({
      user_id: userId,
      payload: {
        tops: row.snapshot.tops,
        bottoms: row.snapshot.bottoms,
        accessories: row.snapshot.accessories,
        savedAt: row.saved_at,
      },
    });
  }

  if (outfit.mutationId) {
    await recordMutation(supabase, userId, outfit.mutationId, 'outfit_upsert', persisted.id);
  }

  return ok(persisted);
}

export async function softDeleteSavedOutfit(
  supabase: SupabaseClient,
  userId: string,
  outfitId: string,
  mutationId?: string
): Promise<SyncResult<true>> {
  if (mutationId) {
    const existing = await findRecordedMutation(supabase, userId, mutationId);
    if (existing.ok && existing.value && existing.value.kind === 'outfit_delete') {
      return ok(true);
    }
  }

  const { error } = await supabase
    .from('saved_outfits_v2')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', outfitId)
    .eq('user_id', userId);

  if (error) {
    return fail(new SyncError(classifyPostgrestError(error.message, error.code), error.message, error));
  }

  if (dualWriteEnabled()) {
    await supabase.from('saved_outfits').delete().eq('id', outfitId).eq('user_id', userId);
  }

  if (mutationId) {
    await recordMutation(supabase, userId, mutationId, 'outfit_delete', outfitId);
  }

  return ok(true);
}
