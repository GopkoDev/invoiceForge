import type { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site.config';
import { privateSectionRoots } from '@/config/routes.config';

// AC-30: prefix rules, so each private section's root is disallowed along with every page under
// it (a `/dashboard/*` rule would leave `/dashboard` itself crawlable).
export default function robots(): MetadataRoute.Robots {
  const baseUrl = siteConfig.branding.website;

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: [...privateSectionRoots, '/api/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
