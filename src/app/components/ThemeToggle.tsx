'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <span
        className="inline-flex h-10 w-10 shrink-0 rounded-full border-2 border-[var(--clue-border)] opacity-40"
        aria-hidden
      />
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[var(--clue-border)] bg-[var(--clue-surface)] transition-colors hover:bg-[var(--clue-hover-overlay)]"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-[var(--clue-text)]" strokeWidth={2.25} aria-hidden />
      ) : (
        <Moon className="h-4 w-4 text-[var(--clue-text)]" strokeWidth={2.25} aria-hidden />
      )}
    </button>
  );
}
