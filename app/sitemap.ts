import type { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site.config';
import { publicRoutes, legalRoutes } from '@/config/routes.config';

/**
 * Dynamic sitemap generation for public pages
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteConfig.branding.website;
  //   const currentDate = new Date();
  const currentDate = '2026-01-23T00:00:00.000Z';

  return [
    {
      url: `${baseUrl}${publicRoutes.landing}`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}${legalRoutes.privacy}`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}${legalRoutes.terms}`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.5,
    },
  ];
}
