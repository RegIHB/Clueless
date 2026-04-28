import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { parseSupabasePublicEnv } from '@/lib/supabase/env';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const env = parseSupabasePublicEnv();
  if (!env) {
    throw new Error('Missing or invalid NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createServerClient(env.url, env.anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          /* ignore when called from a Server Component */
        }
      },
    },
  });
}
