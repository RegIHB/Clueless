import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { countWardrobeItems, fetchWardrobe, insertWardrobeItem } from '@/lib/supabase/sync';
import type { WardrobeCategory } from '@/types/wardrobe';

/** Product CDNs often use protocol-relative or odd URLs; strict .url() rejects valid client payloads. */
const optionalUrlish = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : String(v).trim() || undefined),
  z.string().max(8000).optional()
);

const createWardrobeSchema = z.object({
  code: z.string().min(1),
  type: z.string().min(1),
  category: z.enum(['tops', 'bottoms', 'accessories']),
  imageUrl: optionalUrlish,
  title: z.string().max(500).optional(),
  sourceUrl: optionalUrlish,
  attribution: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const items = await fetchWardrobe(supabase, user.id);
    if (items === null) {
      return NextResponse.json({ error: 'Could not load wardrobe' }, { status: 500 });
    }
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: 'Wardrobe request failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = createWardrobeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid wardrobe payload' }, { status: 400 });
    }

    const payload = parsed.data;
    const counted = await countWardrobeItems(supabase, user.id);
    const sortOrder = payload.sortOrder ?? (counted >= 0 ? counted : 0);
    const result = await insertWardrobeItem(
      supabase,
      user.id,
      {
        code: payload.code,
        type: payload.type,
        category: payload.category as WardrobeCategory,
        ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
        ...(payload.title ? { title: payload.title } : {}),
        ...(payload.sourceUrl ? { sourceUrl: payload.sourceUrl } : {}),
        ...(payload.attribution ? { attribution: payload.attribution } : {}),
      },
      Math.max(0, sortOrder)
    );

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Wardrobe write failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
