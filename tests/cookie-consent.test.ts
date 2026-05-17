import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_CONSENT_VERSION,
  parseCookieConsent,
  readCookieConsent,
  writeCookieConsent,
} from '@/lib/cookie-consent';

function mockBrowserStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', {
    localStorage: storage,
    dispatchEvent: vi.fn(),
  });
}

describe('cookie consent storage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockBrowserStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('parseCookieConsent rejects invalid payloads', () => {
    expect(parseCookieConsent(null)).toBeNull();
    expect(parseCookieConsent('not-json')).toBeNull();
    expect(parseCookieConsent(JSON.stringify({ version: 99, essential: true, analytics: true }))).toBeNull();
    expect(parseCookieConsent(JSON.stringify({ version: 1, essential: false, analytics: true }))).toBeNull();
  });

  test('write and read round-trip', () => {
    const saved = writeCookieConsent(true);
    expect(saved.version).toBe(COOKIE_CONSENT_VERSION);
    expect(saved.analytics).toBe(true);

    const loaded = readCookieConsent();
    expect(loaded?.analytics).toBe(true);
    expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBeTruthy();
  });

  test('essential-only consent disables analytics', () => {
    writeCookieConsent(false);
    expect(readCookieConsent()?.analytics).toBe(false);
  });
});
