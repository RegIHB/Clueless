'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CookiePolicyContent } from './CookiePolicyContent';

export type CookieBannerView = 'compact' | 'details';

type CookieConsentBannerProps = {
  open: boolean;
  view: CookieBannerView;
  onViewChange: (view: CookieBannerView) => void;
  onAcceptAll: () => void;
  onEssentialOnly: () => void;
};

export function CookieConsentBanner({
  open,
  view,
  onViewChange,
  onAcceptAll,
  onEssentialOnly,
}: CookieConsentBannerProps) {
  const acceptRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => acceptRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open, view]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cookie-consent-title"
          aria-describedby={view === 'compact' ? 'cookie-consent-desc' : 'cookie-policy-body'}
          aria-live="polite"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-x-0 bottom-0 z-[200] px-4 pb-4 pt-2 sm:px-6 sm:pb-6 pointer-events-none"
        >
          <div
            className="pointer-events-auto mx-auto max-w-3xl rounded-2xl p-4 sm:p-5"
            style={{
              background: '#fff',
              border: '3px solid #000',
              boxShadow: '8px 8px 0 #000',
            }}
          >
            <p
              id="cookie-consent-title"
              className="mb-1 tracking-[0.08em] uppercase"
              style={{ fontSize: '10px', fontWeight: 900, opacity: 0.55 }}
            >
              {view === 'details' ? 'Cookie policy' : 'Cookies'}
            </p>

            {view === 'compact' ? (
              <>
                <p
                  id="cookie-consent-desc"
                  className="mb-4 text-pretty"
                  style={{ fontSize: '13px', lineHeight: 1.55, fontWeight: 500, opacity: 0.85 }}
                >
                  We use essential storage so sign-in, your wardrobe, and preferences work. With your
                  permission we also load privacy-friendly analytics to improve Clueless.{' '}
                  <button
                    type="button"
                    onClick={() => onViewChange('details')}
                    className="underline underline-offset-2 hover:opacity-70"
                    style={{ fontWeight: 600 }}
                  >
                    Cookie policy
                  </button>
                </p>
              </>
            ) : (
              <div
                id="cookie-policy-body"
                className="mb-4 max-h-[min(42vh,320px)] space-y-3 overflow-y-auto text-pretty pr-1"
                style={{ fontSize: '13px', lineHeight: 1.6, fontWeight: 500, opacity: 0.85 }}
              >
                <CookiePolicyContent />
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              {view === 'details' ? (
                <button
                  type="button"
                  onClick={() => onViewChange('compact')}
                  className="w-full sm:w-auto rounded-full border-2 border-black px-4 py-2 transition-colors hover:bg-black/5"
                  style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}
                >
                  BACK
                </button>
              ) : (
                <span className="hidden sm:block sm:flex-1" aria-hidden />
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onEssentialOnly}
                  className="w-full sm:w-auto rounded-full border-2 border-black px-5 py-2.5 transition-colors hover:bg-black/5 active:bg-black/10"
                  style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em' }}
                >
                  ESSENTIAL ONLY
                </button>
                <button
                  ref={acceptRef}
                  type="button"
                  onClick={onAcceptAll}
                  className="w-full sm:w-auto rounded-full border-2 border-black px-5 py-2.5 text-white transition-opacity hover:opacity-90 active:opacity-80"
                  style={{ background: '#000', fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em' }}
                >
                  ACCEPT ALL
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
