'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, CheckCircle } from 'lucide-react';

export default function BillingSuccessPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(interval);
          router.push('/?upgraded=1');
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [router]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
      style={{ background: 'linear-gradient(135deg, #FFB6C1 0%, #FFC0CB 50%, #FFD1DC 100%)' }}
    >
      <div className="max-w-md w-full">
        {/* Icon */}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8"
          style={{ background: '#000', boxShadow: '6px 6px 0 #FF69B4' }}
        >
          <Sparkles className="w-10 h-10 text-white" strokeWidth={2} />
        </div>

        {/* Heading */}
        <h1
          className="mb-3"
          style={{ fontSize: 'clamp(32px, 6vw, 52px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1 }}
        >
          You're officially Pro.
        </h1>
        <p className="mb-10" style={{ fontSize: '16px', fontWeight: 500, opacity: 0.7, lineHeight: 1.6 }}>
          Unlimited looks, priority renders, and the full experience — all unlocked.
        </p>

        {/* Perks */}
        <div
          className="rounded-2xl p-6 mb-10 text-left"
          style={{ background: '#fff', border: '3px solid #000', boxShadow: '6px 6px 0 #000' }}
        >
          <p className="mb-4" style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.08em', opacity: 0.5 }}>
            WHAT YOU JUST UNLOCKED
          </p>
          {[
            'Unlimited try-ons — no daily cap',
            'Priority rendering queue',
            'AI style coach',
            'Early access to new features',
            'Priority support',
          ].map((perk) => (
            <div key={perk} className="flex items-center gap-3 mb-3 last:mb-0">
              <CheckCircle className="w-5 h-5 shrink-0" strokeWidth={2.5} style={{ color: '#FF69B4' }} />
              <span style={{ fontSize: '14px', fontWeight: 600 }}>{perk}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => router.push('/?upgraded=1')}
          className="w-full py-4 rounded-2xl text-white mb-4"
          style={{
            background: '#000',
            fontSize: '14px',
            fontWeight: 800,
            letterSpacing: '0.05em',
            boxShadow: '4px 4px 0 #FF69B4',
          }}
        >
          LET'S GO →
        </button>
        <p style={{ fontSize: '12px', opacity: 0.5, fontWeight: 500 }}>
          Redirecting automatically in {countdown}s
        </p>
      </div>
    </div>
  );
}
