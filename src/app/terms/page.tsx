import type { Metadata } from 'next';
import { LegalDocumentPage } from '@/app/components/LegalDocumentPage';

export const metadata: Metadata = {
  title: 'Terms of Service — Clueless',
};

export default function TermsPage() {
  return (
    <LegalDocumentPage title="Terms of Service">
      <p>Last updated: May 2026</p>
      <p>
        By using Clueless you agree to use the service for personal, lawful purposes. You are responsible
        for the photos and content you upload and for keeping your account credentials secure.
      </p>
      <p>
        AI styling and virtual try-on results are suggestions only. We do not guarantee accuracy of
        product matches, fit, or generated images. Paid Pro features are billed through our payment
        provider; subscription terms shown at checkout apply.
      </p>
      <p>
        We may update these terms or the service over time. Continued use after changes constitutes
        acceptance of the updated terms.
      </p>
    </LegalDocumentPage>
  );
}
