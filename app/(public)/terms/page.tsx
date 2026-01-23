import type { Metadata } from 'next';
import { siteConfig } from '@/config/site.config';
import { TermsOfServiceContent } from './terms-content';
import { legalRoutes } from '@/config/routes.config';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Read the terms and conditions for using Invoice Forge. Understand your rights and responsibilities.',
  keywords: [
    'terms of service',
    'terms and conditions',
    'user agreement',
    'legal terms',
    'service terms',
  ],
  openGraph: {
    title: 'Terms of Service | Invoice Forge',
    description: 'Read the terms and conditions for using Invoice Forge.',
    url: `${siteConfig.branding.website}/${legalRoutes.terms}`,
    type: 'website',
  },
  alternates: {
    canonical: `${siteConfig.branding.website}/${legalRoutes.terms}`,
  },
};

export default function TermsOfServicePage() {
  return <TermsOfServiceContent />;
}
