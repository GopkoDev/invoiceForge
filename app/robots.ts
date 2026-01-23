import type { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site.config';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = siteConfig.branding.website;

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/privacy', '/terms'],
        disallow: [
          '/dashboard/*',
          '/settings/*',
          '/customers/*',
          '/products/*',
          '/sender-profiles/*',
          '/invoices/*',
          '/api/*',
          '/login',
          '/verify-request',
          '/error',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
