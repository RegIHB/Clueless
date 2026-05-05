import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { countWardrobeItems, fetchWardrobe, insertWardrobeItem } from '@/lib/supabase/sync';
import type { WardrobeCategory } from '@/types/wardrobe';

const createWardrobeSchema = z.object({
  code: z.string().min(1),
  type: z.string().min(1),
  category: z.enum(['tops', 'bottoms', 'accessories']),
  imageUrl: z.string().url().optional(),
  title: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  attribution: z.string().optional(),
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
    const sortOrder = payload.sortOrder ?? (await countWardrobeItems(supabase, user.id));
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
