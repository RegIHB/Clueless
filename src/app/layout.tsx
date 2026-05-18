import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Clueless app landing page",
  description: "Clueless AI styling assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="clueless-app min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
