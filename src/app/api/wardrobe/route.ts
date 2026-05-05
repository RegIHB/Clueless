import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/app/api/_helpers/auth';
import { fetchWardrobeV2 } from '@/lib/supabase/sync/queries';
import { upsertWardrobeItem } from '@/lib/supabase/sync/mutations';
import { fetchWardrobe as legacyFetchWardrobe } from '@/lib/supabase/sync';
import type { WardrobeCategory } from '@/types/wardrobe';
import { readFromV2 } from '@/lib/supabase/sync-feature-flags';

/** Allow product-CDN URLs (protocol-relative, signed) without strict URL parsing. */
const optionalUrlish = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : String(v).trim() || undefined),
  z.string().max(8000).optional()
);

const upsertSchema = z.object({
  code: z.string().min(1).max(120),
  type: z.string().min(1).max(120),
  category: z.enum(['tops', 'bottoms', 'accessories']),
  imageUrl: optionalUrlish,
  title: z.string().max(500).optional(),
  sourceUrl: optionalUrlish,
  attribution: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).optional(),
  clientMutationId: z.string().min(1).max(120).optional(),
});

export async function GET() {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  if (readFromV2()) {
    const result = await fetchWardrobeV2(ctx.supabase, ctx.userId);
    if (!result.ok) {
      return NextResponse.json(
        { error: { code: result.error.code, message: result.error.message } },
        { status: 500 }
      );
    }
    return NextResponse.json({ items: result.value });
  }

  // Legacy read fallback so we can roll back without redeploying clients.
  const items = await legacyFetchWardrobe(ctx.supabase, ctx.userId);
  if (items === null) {
    return NextResponse.json(
      { error: { code: 'unavailable', message: 'Could not load wardrobe' } },
      { status: 500 }
    );
  }
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'validation', message: 'Invalid JSON payload' } },
      { status: 400 }
    );
  }

  const parsed = upsertSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'validation', message: 'Invalid wardrobe payload', details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const sortOrder = payload.sortOrder ?? 0;
  const item = {
    code: payload.code,
    type: payload.type,
    category: payload.category as WardrobeCategory,
    ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
    ...(payload.title ? { title: payload.title } : {}),
    ...(payload.sourceUrl ? { sourceUrl: payload.sourceUrl } : {}),
    ...(payload.attribution ? { attribution: payload.attribution } : {}),
  };

  const result = await upsertWardrobeItem(
    ctx.supabase,
    ctx.userId,
    item,
    Math.max(0, sortOrder),
    payload.clientMutationId
  );

  if (!result.ok) {
    const status = result.error.code === 'conflict' ? 409 : 500;
    return NextResponse.json(
      { error: { code: result.error.code, message: result.error.message } },
      { status }
    );
  }

  return NextResponse.json({ ok: true, id: result.value.id, code: result.value.clientItemId });
}
