/** Shared validation so bad .env values don't enable "half-on" Supabase mode. */
export function parseSupabasePublicEnv(): { url: string; anon: string } | null {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const rawAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !rawAnon) return null;
  if (rawAnon.length < 20) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (!parsed.hostname || parsed.hostname === 'placeholder') return null;
    return { url: rawUrl, anon: rawAnon };
  } catch {
    return null;
  }
}
