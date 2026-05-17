import type { Metadata } from 'next';
import { LegalDocumentPage } from '@/app/components/LegalDocumentPage';
import { CookiePreferencesButton } from '@/app/components/CookiePreferencesButton';

export const metadata: Metadata = {
  title: 'Cookie Policy — Clueless',
};

export default function CookiesPage() {
  return (
    <LegalDocumentPage title="Cookie Policy">
      <p>Last updated: May 2026</p>
      <p>
        Clueless uses essential cookies and local storage to keep you signed in, remember preferences
        (such as language mode), and cache wardrobe data for a smoother experience.
      </p>
      <p>
        We may use analytics cookies (for example Vercel Analytics) to understand how the product is used
        in aggregate. These do not sell your personal data.
      </p>
      <p>
        You can change analytics consent anytime using the button below or &quot;Cookie settings&quot; in
        the site footer. Clearing site data in your browser may sign you out and reset preferences.
      </p>
      <CookiePreferencesButton />
    </LegalDocumentPage>
  );
}
