/**
 * Public origin for Supabase auth redirects (email confirmation, password reset).
 *
 * In production, set NEXT_PUBLIC_SITE_URL to your live origin (e.g. https://clueless.vercel.app).
 * It must appear under Supabase → Authentication → URL Configuration → Site URL and Redirect URLs.
 */
export function getPublicSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) {
    try {
      const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      return new URL(withScheme).origin;
    } catch {
      /* fall through */
    }
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

/** Absolute URL for Supabase `emailRedirectTo` / `redirectTo` (trailing slash, root path). */
export function getAuthEmailRedirectUrl(): string | undefined {
  const origin = getPublicSiteOrigin();
  if (!origin) return undefined;
  return `${origin}/`;
}
