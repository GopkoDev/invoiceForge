// T52 (review-2026-09-30 R-12, AC-05) + T56 (S-09): the e2e route sweep must exclude only
// next-auth's catch-all, not every catch-all. The predicate lives in a helper module the sweep
// imports, so this unit test (which runs on every PR, unlike the e2e) exercises the real thing.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  isNextAuthCatchAll,
  type BuiltRoute,
} from '../e2e/support/route-sweep-exclusion';

const route = (urlPath: string): BuiltRoute => ({
  entry: `${urlPath}/page`,
  urlPath,
  kind: 'page',
});

const manifest: BuiltRoute[] = [
  route('/api/auth/[...nextauth]'),
  route('/docs/[...slug]'),
  route('/customers/[id]'),
  route('/api/auth/clear-session'),
];

describe('route sweep exclusion (R-12)', () => {
  it('excludes exactly the next-auth catch-all from a manifest that also has a protected catch-all', () => {
    expect(manifest.filter(isNextAuthCatchAll).map((r) => r.urlPath)).toEqual([
      '/api/auth/[...nextauth]',
    ]);
  });

  it('keeps a protected catch-all in the sweep', () => {
    expect(isNextAuthCatchAll(route('/docs/[...slug]'))).toBe(false);
  });

  it('does not exclude a sibling of the next-auth route', () => {
    expect(isNextAuthCatchAll(route('/api/auth/clear-session'))).toBe(false);
  });

  it('the sweep spec uses the shared predicate and asserts it matched exactly one entry', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'tests/e2e/route-sweep.spec.ts'),
      'utf8'
    );
    expect(source).toContain('./support/route-sweep-exclusion');
    expect(source).not.toMatch(/const isCatchAll = /);
    expect(source).toMatch(/toHaveLength\(1\)/);
  });
});
