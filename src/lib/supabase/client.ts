import { createBrowserClient } from '@supabase/ssr';
import { parseSupabasePublicEnv } from '@/lib/supabase/env';

export function isSupabaseConfigured(): boolean {
  return parseSupabasePublicEnv() !== null;
}

export function createBrowserSupabaseClient() {
  const env = parseSupabasePublicEnv();
  if (!env) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (valid URL and anon key).'
    );
  }
  return createBrowserClient(env.url, env.anon);
}
