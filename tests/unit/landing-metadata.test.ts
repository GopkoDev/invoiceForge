// landing-update T08 (AC-12): the landing route's search/link-preview metadata carries the one-sentence promise;
// the site-wide description (root layout source) stays unchanged so other pages' previews do not change.
import { describe, expect, it, vi } from 'vitest';

// The page only renders <LandingPage />; stub it so the client tree is not loaded for a metadata check.
vi.mock('@/app/(public)/landing-page', () => ({ LandingPage: () => null }));

import { metadata } from '@/app/(public)/page';
import { siteConfig } from '@/config/site.config';

const PROMISE = /invoice draft from one sentence with AI/i;

describe('landing route metadata (landing-update T08, AC-12)', () => {
  it('description mentions an invoice draft from one sentence with AI', () => {
    expect(String(metadata.description)).toMatch(PROMISE);
  });

  it('openGraph description mentions the promise', () => {
    expect(String(metadata.openGraph?.description)).toMatch(PROMISE);
  });

  it('twitter description mentions the promise', () => {
    expect(String(metadata.twitter?.description)).toMatch(PROMISE);
  });

  it('openGraph and twitter titles carry the promise too', () => {
    expect(String(metadata.openGraph?.title)).toMatch(PROMISE);
    expect(String(metadata.twitter?.title)).toMatch(PROMISE);
  });

  it('keeps the root layout openGraph fields it would otherwise drop (shallow merge)', () => {
    expect(metadata.openGraph).toMatchObject({
      url: siteConfig.branding.website,
      siteName: siteConfig.branding.name,
    });
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
  });

  it('site-wide description is unchanged', () => {
    expect(siteConfig.meta.description).toBe(
      'Create professional-looking invoices in seconds with smart autofill, multi-currency support, and instant PDF generation. Free invoice management software for freelancers and small businesses.',
    );
  });
});
