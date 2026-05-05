import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/app/api/_helpers/auth';
import { fetchSavedOutfitsV2 } from '@/lib/supabase/sync/queries';
import { upsertSavedOutfit } from '@/lib/supabase/sync/mutations';
import { fetchSavedOutfits as legacyFetchSavedOutfits } from '@/lib/supabase/sync';
import { readFromV2 } from '@/lib/supabase/sync-feature-flags';

const wardrobeItemSchema = z.object({
  code: z.string().min(1).max(120),
  type: z.string().min(1).max(120),
  category: z.enum(['tops', 'bottoms', 'accessories']),
  imageUrl: z.string().max(8000).optional(),
  title: z.string().max(500).optional(),
  sourceUrl: z.string().max(8000).optional(),
  attribution: z.string().max(500).optional(),
});

const upsertOutfitSchema = z.object({
  clientOutfitId: z.string().min(1).max(120).optional(),
  tops: wardrobeItemSchema.optional(),
  bottoms: wardrobeItemSchema.optional(),
  accessories: wardrobeItemSchema.optional(),
  savedAt: z.string().datetime().optional(),
  clientMutationId: z.string().min(1).max(120).optional(),
});

export async function GET() {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  if (readFromV2()) {
    const result = await fetchSavedOutfitsV2(ctx.supabase, ctx.userId);
    if (!result.ok) {
      return NextResponse.json(
        { error: { code: result.error.code, message: result.error.message } },
        { status: 500 }
      );
    }
    return NextResponse.json({
      favorites: result.value.map((f) => ({ ...f, savedAt: f.savedAt.toISOString() })),
    });
  }

  const favorites = await legacyFetchSavedOutfits(ctx.supabase, ctx.userId);
  if (favorites === null) {
    return NextResponse.json(
      { error: { code: 'unavailable', message: 'Could not load favorites' } },
      { status: 500 }
    );
  }
  return NextResponse.json({
    favorites: favorites.map((f) => ({ ...f, savedAt: f.savedAt.toISOString() })),
  });
}

export async function POST(request: Request) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  const parsed = upsertOutfitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'validation', message: 'Invalid favorites payload' } },
      { status: 400 }
    );
  }
  const payload = parsed.data;
  if (!payload.tops && !payload.bottoms && !payload.accessories) {
    return NextResponse.json(
      { error: { code: 'validation', message: 'At least one item is required' } },
      { status: 400 }
    );
  }

  const clientOutfitId =
    payload.clientOutfitId ??
    `local-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

  const result = await upsertSavedOutfit(ctx.supabase, ctx.userId, {
    clientOutfitId,
    tops: payload.tops,
    bottoms: payload.bottoms,
    accessories: payload.accessories,
    savedAt: payload.savedAt ? new Date(payload.savedAt) : new Date(),
    mutationId: payload.clientMutationId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: result.error.code, message: result.error.message } },
      { status: result.error.code === 'conflict' ? 409 : 500 }
    );
  }

  return NextResponse.json({
    id: result.value.id,
    clientOutfitId,
    savedAt: result.value.savedAt.toISOString(),
  });
}
