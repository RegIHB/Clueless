import { NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_helpers/auth';
import { fetchCanonicalSync } from '@/lib/supabase/sync/queries';

/**
 * Canonical full-sync read. One round-trip returns the user's wardrobe,
 * saved outfits, and last full sync timestamp. The client uses this on
 * cold start to populate state without juggling multiple API calls.
 */
export async function GET() {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  const result = await fetchCanonicalSync(ctx.supabase, ctx.userId);
  if (!result.ok) {
    return NextResponse.json(
      { error: { code: result.error.code, message: result.error.message } },
      { status: result.error.code === 'unavailable' ? 503 : 500 }
    );
  }
  return NextResponse.json({
    items: result.value.items,
    outfits: result.value.outfits.map((o) => ({ ...o, savedAt: o.savedAt.toISOString() })),
    lastFullSyncAt: result.value.lastFullSyncAt,
  });
}
