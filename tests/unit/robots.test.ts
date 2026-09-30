import { describe, expect, it } from 'vitest';
import robots from '@/app/robots';

// AC-30: crawlers are told not to crawl the root or any page of each private section.
// Rules follow the contracts/openapi.yaml getRobots example (prefix rules, no wildcards).
describe('robots.txt (AC-30)', () => {
  const [rule] = [robots().rules].flat();

  it('disallows each private section by prefix, root included, plus /api/', () => {
    expect(rule.userAgent).toBe('*');
    // Order is irrelevant to crawlers; the set must match exactly.
    expect([...[rule.disallow].flat()].sort()).toEqual(
      [
        '/dashboard',
        '/invoices',
        '/customers',
        '/products',
        '/sender-profiles',
        '/settings',
        '/api/',
      ].sort()
    );
  });

  it('allows everything else and keeps the sitemap', () => {
    expect([rule.allow].flat()).toEqual(['/']);
    expect(robots().sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
