import type { WardrobeItem } from '@/types/wardrobe';

/**
 * Load wardrobe via Next route (HttpOnly session cookies). Use when the browser
 * Supabase client read fails (RLS/JWT timing) so cloud rows still appear.
 */
export async function fetchWardrobeFromApi(): Promise<WardrobeItem[] | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/wardrobe', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { items?: unknown };
    if (!Array.isArray(body.items)) return null;
    return body.items as WardrobeItem[];
  } catch {
    return null;
  }
}
