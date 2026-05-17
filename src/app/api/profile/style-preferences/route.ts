import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/app/api/_helpers/auth';
import { ensureProfileRow, updateProfile } from '@/lib/supabase/sync';

const preferencesSchema = z.object({
  styleVibe: z.string().max(64),
  colorPalette: z.string().max(64),
  notes: z.string().max(500),
});

function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function PATCH(request: Request) {
  const ctx = await requireAuth();
  if (ctx instanceof NextResponse) return ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'validation', message: 'Invalid JSON payload' } },
      { status: 400 }
    );
  }

  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'validation', message: 'Invalid style preferences' } },
      { status: 400 }
    );
  }

  const style_preferences = {
    styleVibe: parsed.data.styleVibe,
    colorPalette: parsed.data.colorPalette,
    notes: parsed.data.notes.trim(),
  };

  const admin = adminSupabase();
  if (admin) {
    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('id', ctx.userId)
      .maybeSingle();

    if (!existing) {
      const { error: insertError } = await admin.from('profiles').insert({ id: ctx.userId });
      if (insertError && insertError.code !== '23505') {
        console.error('[style-preferences] profile insert', insertError);
        return NextResponse.json(
          { error: { code: 'save_failed', message: 'Could not save style preferences.' } },
          { status: 500 }
        );
      }
    }

    const { error } = await admin
      .from('profiles')
      .update({
        style_preferences,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ctx.userId);

    if (error) {
      console.error('[style-preferences] admin update', error);
      return NextResponse.json(
        { error: { code: 'save_failed', message: 'Could not save style preferences.' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ style_preferences });
  }

  // Local/dev fallback when service role is not configured.
  await ensureProfileRow(ctx.supabase, ctx.userId);
  const ok = await updateProfile(ctx.supabase, ctx.userId, { style_preferences });
  if (!ok) {
    return NextResponse.json(
      {
        error: {
          code: 'save_failed',
          message:
            'Could not save style preferences. Run the latest Supabase migrations (style_preferences grants).',
        },
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ style_preferences });
}
