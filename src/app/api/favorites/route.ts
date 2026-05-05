import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchSavedOutfits, insertSavedOutfit } from '@/lib/supabase/sync';

const wardrobeItemSchema = z.object({
  code: z.string().min(1),
  type: z.string().min(1),
  category: z.enum(['tops', 'bottoms', 'accessories']),
  imageUrl: z.string().optional(),
  title: z.string().optional(),
  sourceUrl: z.string().optional(),
  attribution: z.string().optional(),
});

const createFavoriteSchema = z.object({
  tops: wardrobeItemSchema.optional(),
  bottoms: wardrobeItemSchema.optional(),
  accessories: wardrobeItemSchema.optional(),
  savedAt: z.string().datetime().optional(),
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
    const favorites = await fetchSavedOutfits(supabase, user.id);
    if (favorites === null) {
      return NextResponse.json({ error: 'Could not load favorites' }, { status: 500 });
    }
    return NextResponse.json({
      favorites: favorites.map((f) => ({
        ...f,
        savedAt: f.savedAt.toISOString(),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Favorites request failed', details: error instanceof Error ? error.message : String(error) },
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

    const parsed = createFavoriteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid favorites payload' }, { status: 400 });
    }
    const payload = parsed.data;
    if (!payload.tops && !payload.bottoms && !payload.accessories) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 });
    }
    const result = await insertSavedOutfit(supabase, user.id, {
      tops: payload.tops,
      bottoms: payload.bottoms,
      accessories: payload.accessories,
      savedAt: payload.savedAt ? new Date(payload.savedAt) : new Date(),
    });
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ id: result.id });
  } catch (error) {
    return NextResponse.json(
      { error: 'Favorites write failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
