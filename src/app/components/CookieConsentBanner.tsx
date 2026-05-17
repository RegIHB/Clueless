'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';

type CookieConsentBannerProps = {
  open: boolean;
  onAcceptAll: () => void;
  onEssentialOnly: () => void;
};

export function CookieConsentBanner({ open, onAcceptAll, onEssentialOnly }: CookieConsentBannerProps) {
  const acceptRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => acceptRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-labelledby="cookie-consent-title"
          aria-describedby="cookie-consent-desc"
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
              Cookies
            </p>
            <p
              id="cookie-consent-desc"
              className="mb-4 text-pretty"
              style={{ fontSize: '13px', lineHeight: 1.55, fontWeight: 500, opacity: 0.85 }}
            >
              We use essential storage so sign-in, your wardrobe, and preferences work. With your
              permission we also load privacy-friendly analytics to improve Clueless.{' '}
              <Link href="/cookies" className="underline underline-offset-2 hover:opacity-70">
                Cookie policy
              </Link>
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
