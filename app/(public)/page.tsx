import type { Metadata } from 'next';
import { LandingPage } from './landing-page';
import { siteConfig } from '@/config/site.config';

export const metadata: Metadata = {
  title: 'Home',
  description: siteConfig.meta.description,
  keywords: [
    'invoice management',
    'invoice generator',
    'billing software',
    'professional invoices',
    'business automation',
    'invoice tracking',
    'PDF invoices',
    'multi-currency billing',
    'freelance invoicing',
  ],
  alternates: {
    canonical: siteConfig.branding.website,
  },
};

export default function Home() {
  return <LandingPage />;
}
