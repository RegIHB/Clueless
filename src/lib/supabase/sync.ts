import type { SupabaseClient } from '@supabase/supabase-js';
import type { SavedOutfit, WardrobeItem } from '@/types/wardrobe';
import type { WardrobeSeedItem } from '@/lib/wardrobe-test-data';

type ProfileRow = {
  id: string;
  display_name: string;
  onboarding_completed: boolean;
  selfie_url: string | null;
};

type WardrobeRow = {
  code: string;
  type: string;
  category: string;
  image_url: string | null;
  title: string | null;
  source_url: string | null;
  attribution: string | null;
};

function rowToItem(row: WardrobeRow): WardrobeItem {
  return {
    code: row.code,
    type: row.type,
    category: row.category as WardrobeItem['category'],
    ...(row.image_url ? { imageUrl: row.image_url } : {}),
    ...(row.title ? { title: row.title } : {}),
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
    ...(row.attribution ? { attribution: row.attribution } : {}),
  };
}

export async function ensureAnonymousSession(supabase: SupabaseClient) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.session) throw new Error('Anonymous sign-in did not return a session');
  return data.session;
}

export async function fetchProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, onboarding_completed, selfie_url')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('fetchProfile', error);
    return null;
  }
  return data as ProfileRow | null;
}

export async function ensureProfileRow(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase.from('profiles').insert({ id: userId });
  if (error && !error.message?.includes('duplicate') && error.code !== '23505') {
    console.error('ensureProfileRow', error);
    return false;
  }
  return true;
}

export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<Pick<ProfileRow, 'display_name' | 'onboarding_completed' | 'selfie_url'>>
) {
  const { error } = await supabase
    .from('profiles')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (error) console.error('updateProfile', error);
  return !error;
}

/** `null` = query failed (RLS/network); not the same as an empty closet. */
export async function fetchWardrobe(
  supabase: SupabaseClient,
  userId: string
): Promise<WardrobeItem[] | null> {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .select('code, type, category, image_url, title, source_url, attribution')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('fetchWardrobe', error);
    return null;
  }
  return (data as WardrobeRow[]).map(rowToItem);
}

export async function countWardrobeItems(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('wardrobe_items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) return -1;
  return count ?? 0;
}

export async function seedWardrobeFromDemo(
  supabase: SupabaseClient,
  userId: string,
  items: WardrobeSeedItem[]
) {
  const rows = items.map((item, index) => ({
    user_id: userId,
    code: item.code,
    type: item.type,
    category: item.category,
    image_url: item.imageUrl ?? null,
    title: item.title ?? null,
    source_url: item.sourceUrl ?? null,
    attribution: null,
    sort_order: index,
  }));

  const { error } = await supabase.from('wardrobe_items').insert(rows);
  if (error) {
    console.error('seedWardrobeFromDemo', error);
    return false;
  }
  return true;
}

const MAX_IMAGE_URL_DB = 8000;

function imageUrlForDb(url?: string): string | null {
  if (!url) return null;
  if (url.startsWith('data:')) return null;
  if (url.length > MAX_IMAGE_URL_DB) return url.slice(0, MAX_IMAGE_URL_DB);
  return url;
}

export async function insertWardrobeItem(
  supabase: SupabaseClient,
  userId: string,
  item: WardrobeItem,
  sortOrder: number
): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.from('wardrobe_items').insert({
    user_id: userId,
    code: item.code,
    type: item.type,
    category: item.category,
    image_url: imageUrlForDb(item.imageUrl),
    title: item.title ?? null,
    source_url: item.sourceUrl
      ? item.sourceUrl.slice(0, MAX_IMAGE_URL_DB)
      : null,
    attribution: item.attribution ?? null,
    sort_order: sortOrder,
  });
  if (error) {
    console.error('insertWardrobeItem', error);
    return { error: error.message || 'Insert failed' };
  }
  return { ok: true };
}

type OutfitPayload = {
  tops?: WardrobeItem;
  bottoms?: WardrobeItem;
  accessories?: WardrobeItem;
  savedAt: string;
};

const MAX_SNAPSHOT_URL = 2048;

/**
 * Persist only small, JSON-safe fields. Huge `data:image/...` URLs often break inserts or hit size limits;
 * `code` is kept so the app can re-merge images from `wardrobe_items` on load.
 */
function slimWardrobeSnapshot(item: WardrobeItem | undefined): WardrobeItem | undefined {
  if (!item) return undefined;
  const out: WardrobeItem = {
    code: item.code,
    type: item.type,
    category: item.category,
  };
  if (item.title) out.title = item.title.slice(0, 500);
  if (item.sourceUrl && item.sourceUrl.length <= MAX_SNAPSHOT_URL) {
    out.sourceUrl = item.sourceUrl;
  }
  if (item.attribution) out.attribution = item.attribution.slice(0, 500);
  const img = item.imageUrl;
  if (img && !img.startsWith('data:') && img.length <= MAX_SNAPSHOT_URL) {
    out.imageUrl = img;
  }
  return out;
}

/** `null` if the query failed (RLS/network); do not treat as “no outfits”. */
export async function fetchSavedOutfits(
  supabase: SupabaseClient,
  userId: string
): Promise<SavedOutfit[] | null> {
  const { data, error } = await supabase
    .from('saved_outfits')
    .select('id, payload')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchSavedOutfits', error);
    return null;
  }

  return (data as { id: string; payload: OutfitPayload }[]).map((row) => ({
    id: row.id,
    tops: row.payload.tops,
    bottoms: row.payload.bottoms,
    accessories: row.payload.accessories,
    savedAt: new Date(row.payload.savedAt),
  }));
}

export async function insertSavedOutfit(
  supabase: SupabaseClient,
  userId: string,
  outfit: Omit<SavedOutfit, 'id'>
): Promise<{ id: string } | { error: string }> {
  const payload: OutfitPayload = {
    tops: slimWardrobeSnapshot(outfit.tops),
    bottoms: slimWardrobeSnapshot(outfit.bottoms),
    accessories: slimWardrobeSnapshot(outfit.accessories),
    savedAt: outfit.savedAt.toISOString(),
  };

  const { data, error } = await supabase
    .from('saved_outfits')
    .insert({ user_id: userId, payload })
    .select('id')
    .single();

  if (error) {
    console.error('insertSavedOutfit', error);
    return { error: error.message || 'Insert failed' };
  }
  return { id: data?.id as string };
}

export async function deleteSavedOutfit(
  supabase: SupabaseClient,
  userId: string,
  outfitId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('saved_outfits')
    .delete()
    .eq('id', outfitId)
    .eq('user_id', userId);

  if (error) {
    console.error('deleteSavedOutfit', error);
    return false;
  }
  return true;
}
