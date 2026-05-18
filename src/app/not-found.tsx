import Link from "next/link";
import { Shirt } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 py-16"
      style={{ background: "linear-gradient(135deg, #FFE5C8 0%, #FFD4B8 100%)" }}
    >
      <div
        className="w-full max-w-md text-center p-8 sm:p-10 rounded-3xl"
        style={{ background: 'var(--clue-surface)', border: '4px solid var(--clue-border)', boxShadow: 'var(--clue-shadow-hero)' }}
      >
        <div
          className="mx-auto mb-6 w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: 'var(--clue-inverse)', color: 'var(--clue-inverse-text)' }}
          aria-hidden
        >
          <Shirt className="w-7 h-7" strokeWidth={2} />
        </div>
        <p className="tracking-[0.14em] uppercase mb-2" style={{ fontSize: "11px", fontWeight: 700, opacity: 0.55 }}>
          404 · Page not found
        </p>
        <h1 className="mb-3" style={{ fontSize: "clamp(24px, 5vw, 32px)", fontWeight: 900, letterSpacing: "-0.02em" }}>
          That look isn’t in the closet
        </h1>
        <p className="mb-8" style={{ fontSize: "14px", lineHeight: 1.65, fontWeight: 500, opacity: 0.75 }}>
          The page you’re after doesn’t exist (yet). Let’s get you back to your wardrobe.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-8 py-3 rounded-full text-white transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out)] hover:scale-[1.03] active:scale-[0.97]"
          style={{
            background: 'var(--clue-inverse)',
            border: '2px solid var(--clue-border)',
            boxShadow: 'var(--clue-shadow-md)',
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.12em",
          }}
        >
          BACK TO HOME
        </Link>
      </div>
    </div>
  );
}
