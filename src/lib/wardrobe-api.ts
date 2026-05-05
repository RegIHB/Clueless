import type { SavedOutfit, WardrobeItem } from '@/types/wardrobe';

/** Wraps a fetch+JSON parse so callers can branch on a single failure value. */
async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch(url, { credentials: 'include', cache: 'no-store', ...init });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchWardrobeFromApi(): Promise<WardrobeItem[] | null> {
  const body = await getJson<{ items?: WardrobeItem[] }>('/api/wardrobe');
  return Array.isArray(body?.items) ? (body!.items as WardrobeItem[]) : null;
}

export type CanonicalSyncPayload = {
  items: WardrobeItem[];
  outfits: SavedOutfit[];
  lastFullSyncAt: string;
};

/**
 * One-shot canonical read used by the auth orchestrator on cold start.
 * Returns null if the call fails so callers can choose to retry or surface
 * a toast. Server-side `last_full_sync_at` is bumped on success.
 */
export async function fetchCanonicalSyncFromApi(): Promise<CanonicalSyncPayload | null> {
  const body = await getJson<{
    items?: WardrobeItem[];
    outfits?: Array<Omit<SavedOutfit, 'savedAt'> & { savedAt: string }>;
    lastFullSyncAt?: string;
  }>('/api/sync');
  if (!body || !Array.isArray(body.items) || !Array.isArray(body.outfits)) return null;
  return {
    items: body.items,
    outfits: body.outfits.map((o) => ({ ...o, savedAt: new Date(o.savedAt) })),
    lastFullSyncAt: body.lastFullSyncAt ?? new Date().toISOString(),
  };
}

/** Optimistic upsert via API; returns the canonical row on success. */
export async function upsertWardrobeViaApi(item: WardrobeItem & { sortOrder?: number; clientMutationId?: string }) {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/wardrobe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
      return { ok: false as const, error: payload.error?.message ?? `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { id: string; code: string };
    return { ok: true as const, id: data.id, code: data.code };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : 'Network error' };
  }
}
