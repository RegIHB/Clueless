import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { parseSupabasePublicEnv } from '@/lib/supabase/env';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const env = parseSupabasePublicEnv();
  if (!env) {
    return supabaseResponse;
  }

  try {
    const supabase = createServerClient(env.url, env.anon, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    await supabase.auth.getUser();
  } catch (err) {
    console.error('[supabase middleware] session refresh failed:', err);
  }

  return supabaseResponse;
}
