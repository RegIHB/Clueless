'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Analytics } from '@vercel/analytics/next';
import {
  COOKIE_CONSENT_EVENT,
  readCookieConsent,
  writeCookieConsent,
  type CookieConsent,
} from '@/lib/cookie-consent';
import { CookieConsentBanner, type CookieBannerView } from './CookieConsentBanner';

type CookieConsentContextValue = {
  consent: CookieConsent | null;
  ready: boolean;
  analyticsAllowed: boolean;
  showBanner: boolean;
  acceptAll: () => void;
  acceptEssentialOnly: () => void;
  openPreferences: () => void;
};

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

export function useCookieConsent(): CookieConsentContextValue {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) {
    throw new Error('useCookieConsent must be used within CookieConsentProvider');
  }
  return ctx;
}

export function useCookieConsentOptional(): CookieConsentContextValue | null {
  return useContext(CookieConsentContext);
}

function ConditionalAnalytics({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return <Analytics />;
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<CookieConsent | null>(null);
  const [ready, setReady] = useState(false);
  const [forceBanner, setForceBanner] = useState(false);
  const [bannerView, setBannerView] = useState<CookieBannerView>('compact');

  useEffect(() => {
    setConsent(readCookieConsent());
    setReady(true);

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<CookieConsent | null>).detail ?? null;
      setConsent(detail);
      if (detail) {
        setForceBanner(false);
        setBannerView('compact');
      }
    };

    window.addEventListener(COOKIE_CONSENT_EVENT, onChange);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onChange);
  }, []);

  const persist = useCallback((analytics: boolean) => {
    const next = writeCookieConsent(analytics);
    setConsent(next);
    setForceBanner(false);
    setBannerView('compact');
  }, []);

  const acceptAll = useCallback(() => persist(true), [persist]);
  const acceptEssentialOnly = useCallback(() => persist(false), [persist]);
  const openPreferences = useCallback(() => {
    setBannerView('details');
    setForceBanner(true);
  }, []);

  const showBanner = ready && (forceBanner || consent === null);
  const analyticsAllowed = consent?.analytics === true;

  const value = useMemo(
    () => ({
      consent,
      ready,
      analyticsAllowed,
      showBanner,
      acceptAll,
      acceptEssentialOnly,
      openPreferences,
    }),
    [consent, ready, analyticsAllowed, showBanner, acceptAll, acceptEssentialOnly, openPreferences]
  );

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
      <CookieConsentBanner
        open={showBanner}
        view={bannerView}
        onViewChange={setBannerView}
        onAcceptAll={acceptAll}
        onEssentialOnly={acceptEssentialOnly}
      />
      <ConditionalAnalytics enabled={analyticsAllowed} />
    </CookieConsentContext.Provider>
  );
}
