"use client";

import { ThemeProvider } from "next-themes";
import { MotionConfig } from "motion/react";
import { Toaster } from "./components/ui/sonner";
import { CookieConsentProvider } from "./components/CookieConsentProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <MotionConfig reducedMotion="user">
        <CookieConsentProvider>
          {children}
          <Toaster richColors closeButton position="top-center" />
        </CookieConsentProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
