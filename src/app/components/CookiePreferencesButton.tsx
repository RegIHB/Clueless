'use client';

import { useCookieConsent } from './CookieConsentProvider';

type CookiePreferencesButtonProps = {
  className?: string;
};

export function CookiePreferencesButton({ className }: CookiePreferencesButtonProps) {
  const { openPreferences, consent } = useCookieConsent();

  return (
    <button
      type="button"
      onClick={openPreferences}
      className={
        className ??
        'mt-2 inline-flex items-center justify-center rounded-full border-2 border-black px-5 py-2.5 transition-opacity hover:opacity-80'
      }
      style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em' }}
    >
      {consent ? 'MANAGE COOKIE PREFERENCES' : 'SET COOKIE PREFERENCES'}
    </button>
  );
}
