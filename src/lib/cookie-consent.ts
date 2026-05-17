export const COOKIE_CONSENT_STORAGE_KEY = 'clueless_cookie_consent_v1';
export const COOKIE_CONSENT_VERSION = 1;
export const COOKIE_CONSENT_EVENT = 'clueless:cookie-consent';

export type CookieConsent = {
  version: number;
  essential: true;
  analytics: boolean;
  decidedAt: string;
};

export function parseCookieConsent(raw: string | null): CookieConsent | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CookieConsent;
    if (parsed.version !== COOKIE_CONSENT_VERSION) return null;
    if (parsed.essential !== true) return null;
    if (typeof parsed.analytics !== 'boolean') return null;
    if (typeof parsed.decidedAt !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readCookieConsent(): CookieConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseCookieConsent(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeCookieConsent(analytics: boolean): CookieConsent {
  const consent: CookieConsent = {
    version: COOKIE_CONSENT_VERSION,
    essential: true,
    analytics,
    decidedAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(consent));
    } catch {
      // ignore quota errors
    }
    window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: consent }));
  }
  return consent;
}

export function clearCookieConsent(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(COOKIE_CONSENT_STORAGE_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: null }));
}
