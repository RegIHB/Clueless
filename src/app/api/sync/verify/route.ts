import { NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_helpers/auth';
import { fetchWardrobe as legacyFetchWardrobe, fetchSavedOutfits as legacyFetchSavedOutfits } from '@/lib/supabase/sync';
import { fetchWardrobeV2, fetchSavedOutfitsV2 } from '@/lib/supabase/sync/queries';
import { snapshotSyncRollout } from '@/lib/supabase/sync-feature-flags';

/**
 * Per-user parity check. Compares v1 vs v2 row counts/codes for the caller so
 * we can validate dual-write health without leaving the user's RLS scope.
 */
export async function GET() {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  const [v1Wardrobe, v2Wardrobe, v1Outfits, v2Outfits] = await Promise.all([
    legacyFetchWardrobe(ctx.supabase, ctx.userId),
    fetchWardrobeV2(ctx.supabase, ctx.userId),
    legacyFetchSavedOutfits(ctx.supabase, ctx.userId),
    fetchSavedOutfitsV2(ctx.supabase, ctx.userId),
  ]);

  const v2WardrobeOk = v2Wardrobe.ok;
  const v2OutfitsOk = v2Outfits.ok;

  const v1WardrobeCodes = new Set((v1Wardrobe ?? []).map((i) => i.code));
  const v2WardrobeCodes = new Set(v2WardrobeOk ? v2Wardrobe.value.map((i) => i.code) : []);
  const wardrobeMissingInV2 = [...v1WardrobeCodes].filter((c) => !v2WardrobeCodes.has(c));
  const wardrobeMissingInV1 = [...v2WardrobeCodes].filter((c) => !v1WardrobeCodes.has(c));

  const v1OutfitCount = v1Outfits?.length ?? 0;
  const v2OutfitCount = v2OutfitsOk ? v2Outfits.value.length : 0;

  return NextResponse.json({
    rollout: snapshotSyncRollout(),
    wardrobe: {
      v1Count: v1Wardrobe?.length ?? 0,
      v2Count: v2WardrobeOk ? v2Wardrobe.value.length : 0,
      missingInV2: wardrobeMissingInV2,
      missingInV1: wardrobeMissingInV1,
    },
    outfits: {
      v1Count: v1OutfitCount,
      v2Count: v2OutfitCount,
    },
    v2WardrobeError: v2WardrobeOk ? null : v2Wardrobe.error.message,
    v2OutfitsError: v2OutfitsOk ? null : v2Outfits.error.message,
  });
}
