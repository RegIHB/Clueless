'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCookieConsent } from './CookieConsentProvider';

/** Sends /cookies visitors to home with the in-app cookie preferences panel open. */
export function CookiesPageRedirect() {
  const router = useRouter();
  const { openPreferences } = useCookieConsent();

  useEffect(() => {
    openPreferences();
    router.replace('/');
  }, [openPreferences, router]);

  return (
    <div
      className="flex min-h-[40vh] items-center justify-center px-6"
      style={{ fontSize: '13px', fontWeight: 600, opacity: 0.7 }}
    >
      Opening cookie preferences…
    </div>
  );
}
