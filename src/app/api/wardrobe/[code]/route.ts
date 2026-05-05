import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { deleteWardrobeItem } from '@/lib/supabase/sync';

type Params = { params: Promise<{ code: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { code } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const ok = await deleteWardrobeItem(supabase, user.id, decodeURIComponent(code));
    if (!ok) {
      return NextResponse.json({ error: 'Could not delete wardrobe item' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Wardrobe delete failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
