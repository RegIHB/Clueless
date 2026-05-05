import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { deleteSavedOutfit } from '@/lib/supabase/sync';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const ok = await deleteSavedOutfit(supabase, user.id, decodeURIComponent(id));
    if (!ok) {
      return NextResponse.json({ error: 'Could not delete favorite' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Favorites delete failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
