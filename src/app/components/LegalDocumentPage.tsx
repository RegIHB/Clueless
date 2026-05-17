import Link from 'next/link';
import { Shirt } from 'lucide-react';

type LegalDocumentPageProps = {
  title: string;
  children: React.ReactNode;
};

export function LegalDocumentPage({ title, children }: LegalDocumentPageProps) {
  return (
    <div
      className="min-h-screen px-6 py-16 md:px-12"
      style={{ background: 'linear-gradient(180deg, #FFB3D9 0%, #FFC9E5 50%, #FFE5F1 100%)' }}
    >
      <div
        className="mx-auto max-w-2xl rounded-3xl p-8 md:p-12"
        style={{ background: '#fff', border: '3px solid #000', boxShadow: '10px 10px 0 #000' }}
      >
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black" aria-hidden>
            <Shirt className="h-4 w-4 text-white" strokeWidth={2} />
          </div>
          <span className="tracking-[0.05em] uppercase" style={{ fontSize: '14px', fontWeight: 900 }}>
            Clueless
          </span>
        </div>
        <h1 className="mb-6" style={{ fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 900, letterSpacing: '-0.02em' }}>
          {title}
        </h1>
        <div className="space-y-4" style={{ fontSize: '14px', lineHeight: 1.7, fontWeight: 500, opacity: 0.85 }}>
          {children}
        </div>
        <Link
          href="/"
          className="mt-10 inline-flex items-center justify-center rounded-full border-2 border-black px-6 py-3 transition-opacity hover:opacity-80"
          style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em' }}
        >
          BACK TO HOME
        </Link>
      </div>
    </div>
  );
}
