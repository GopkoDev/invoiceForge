import type { Metadata } from 'next';
import { siteConfig } from '@/config/site.config';
import { PrivacyPolicyContent } from './privacy-content';
import { legalRoutes } from '@/config/routes.config';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Learn how Invoice Forge collects, uses, and protects your data. We prioritize your privacy and security.',
  keywords: [
    'privacy policy',
    'data protection',
    'GDPR compliance',
    'data security',
    'user privacy',
  ],
  openGraph: {
    title: 'Privacy Policy | Invoice Forge',
    description:
      'Learn how Invoice Forge collects, uses, and protects your data.',
    url: `${siteConfig.branding.website}/${legalRoutes.privacy}`,
    type: 'website',
  },
  alternates: {
    canonical: `${siteConfig.branding.website}/${legalRoutes.privacy}`,
  },
};

export default function PrivacyPolicyPage() {
  return <PrivacyPolicyContent />;
}
