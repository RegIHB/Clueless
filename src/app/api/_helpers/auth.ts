import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export type AuthedContext = {
  supabase: SupabaseClient;
  userId: string;
};

/**
 * Single shared auth gate for /api routes. Returns either an `AuthedContext`
 * or a `NextResponse` 401 — callers just check `'userId' in result`.
 */
export async function requireAuth(): Promise<AuthedContext | NextResponse> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json(
      { error: { code: 'unauthorized', message: 'Sign in required.' } },
      { status: 401 }
    );
  }
  return { supabase, userId: data.user.id };
}
