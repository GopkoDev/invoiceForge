import type { Metadata } from 'next';
import { LandingPage } from './landing-page';
import { siteConfig } from '@/config/site.config';
import { landingContent } from '@/constants/public-pages-content';

const { metadata: landingMeta } = landingContent;

export const metadata: Metadata = {
  title: 'Home',
  description: landingMeta.description,
  // Next merges openGraph/twitter shallowly, so the root layout fields are restated here.
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteConfig.branding.website,
    siteName: siteConfig.branding.name,
    ...landingMeta.openGraph,
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@invoiceforge',
    ...landingMeta.twitter,
  },
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
