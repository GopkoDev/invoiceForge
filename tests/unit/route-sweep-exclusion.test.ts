// T52 (review-2026-09-30 R-12, AC-05): the e2e route sweep must exclude only next-auth's
// catch-all, not every catch-all, and must assert the exclusion matched exactly one manifest
// entry. The sweep itself needs a built app, so this guards its source.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const source = fs.readFileSync(path.join(process.cwd(), 'tests/e2e/route-sweep.spec.ts'), 'utf8');

describe('route sweep exclusion (R-12)', () => {
  it('does not skip every catch-all route', () => {
    expect(source).not.toMatch(/urlPath\.includes\(\s*['"]\[\.\.\.['"]\s*\)/);
  });

  it('excludes exactly /api/auth/[...nextauth]', () => {
    expect(source).toContain('/api/auth/[...nextauth]');
  });

  it('asserts the exclusion matched exactly one manifest entry', () => {
    expect(source).toMatch(/excluded[\s\S]{0,200}toHaveLength\(1\)|toHaveLength\(1\)[\s\S]{0,200}excluded/i);
  });
});
