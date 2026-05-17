import type { Metadata } from 'next';
import { CookiesPageRedirect } from '@/app/components/CookiesPageRedirect';

export const metadata: Metadata = {
  title: 'Cookie Policy — Clueless',
};

export default function CookiesPage() {
  return <CookiesPageRedirect />;
}
