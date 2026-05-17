import type { Metadata } from 'next';
import { LegalDocumentPage } from '@/app/components/LegalDocumentPage';

export const metadata: Metadata = {
  title: 'Privacy Policy — Clueless',
};

export default function PrivacyPage() {
  return (
    <LegalDocumentPage title="Privacy Policy">
      <p>Last updated: May 2026</p>
      <p>
        Clueless stores account information (such as your email), wardrobe items you add, saved outfits,
        style preferences, and optional profile photos so the app can provide styling and try-on features.
      </p>
      <p>
        We use third-party services for authentication (Supabase), payments (Lemon Squeezy), and AI or
        image processing when you use those features. Data is processed according to each provider&apos;s
        policies.
      </p>
      <p>
        You can delete your account data by contacting us or removing items from your wardrobe. For
        questions about your data, reach out through the contact option on our website when available.
      </p>
    </LegalDocumentPage>
  );
}
