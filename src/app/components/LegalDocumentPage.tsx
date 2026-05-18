import Link from 'next/link';
import { Shirt } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

type LegalDocumentPageProps = {
  title: string;
  children: React.ReactNode;
};

export function LegalDocumentPage({ title, children }: LegalDocumentPageProps) {
  return (
    <div
      className="min-h-screen px-6 py-16 md:px-12"
      style={{ background: 'var(--clue-page-bg)', color: 'var(--clue-text)' }}
    >
      <div className="mx-auto mb-6 flex max-w-2xl justify-end">
        <ThemeToggle />
      </div>
      <div
        className="mx-auto max-w-2xl rounded-3xl p-8 md:p-12"
        style={{
          background: 'var(--clue-surface)',
          border: '3px solid var(--clue-border)',
          boxShadow: 'var(--clue-shadow-xl)',
        }}
      >
        <div className="mb-8 flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: 'var(--clue-inverse)' }}
            aria-hidden
          >
            <Shirt className="h-4 w-4 text-[var(--clue-inverse-text)]" strokeWidth={2} />
          </div>
          <span className="tracking-[0.05em] uppercase" style={{ fontSize: '14px', fontWeight: 900 }}>
            Clueless
          </span>
        </div>
        <h1
          className="mb-6"
          style={{ fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em' }}
        >
          {title}
        </h1>
        <div
          className="space-y-4"
          style={{ fontSize: '14px', lineHeight: 1.7, fontWeight: 500, color: 'var(--clue-text-muted)' }}
        >
          {children}
        </div>
        <Link
          href="/"
          className="mt-10 inline-flex items-center justify-center rounded-full border-2 border-[var(--clue-border)] px-6 py-3 transition-opacity hover:opacity-80"
          style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--clue-text)' }}
        >
          BACK TO HOME
        </Link>
      </div>
    </div>
  );
}
