// T20 (spec.md §5 AC-01, AC-02, AC-05, AC-20) — the release gate's own artefacts. The gate itself
// runs in Playwright against a preview; these checks pin that the pieces it needs exist and are
// wired the way the task requires: a CSP-violation collector, a genuine-session helper that signs
// in through the real Sign-in link flow, a BASE_URL override, and the ship notes (AC-01 / AC-27).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

// The `prisma` package's declared entry (build/types.js) does not exist, so it cannot be resolved
// through createRequire; its package.json is read straight from the project's node_modules link.
function installedPrismaVersion(): string {
  const manifest = path.join(ROOT, 'node_modules', 'prisma', 'package.json');
  return (JSON.parse(fs.readFileSync(manifest, 'utf8')) as { version: string })
    .version;
}

describe('T20 release gate', () => {
  it('AC-20: a CSP collector listens for securitypolicyviolation and exposes window.__cspViolations', () => {
    expect(
      exists('tests/e2e/support/csp-collector.ts'),
      'tests/e2e/support/csp-collector.ts'
    ).toBe(true);
    const source = read('tests/e2e/support/csp-collector.ts');
    expect(source).toContain('securitypolicyviolation');
    expect(source).toContain('__cspViolations');
    expect(source).toContain('addInitScript');
    expect(source).toContain('chrome-extension://');
  });

  it('AC-02/AC-05: a genuine-session helper signs in through the real Sign-in link flow, not a hand-built cookie', () => {
    expect(
      exists('tests/e2e/support/genuine-session.ts'),
      'tests/e2e/support/genuine-session.ts'
    ).toBe(true);
    const source = read('tests/e2e/support/genuine-session.ts');
    expect(source).toContain('/login');
    expect(source).not.toContain('session-cookie');
  });

  it('AC-05: the route sweep uses the genuine session and asserts no private page lands on /login', () => {
    const sweep = read('tests/e2e/route-sweep.spec.ts');
    expect(sweep).toContain('genuine-session');
    expect(sweep).not.toContain('tests/support/session-cookie');
  });

  it('AC-20: csp-gate.spec.ts collects violations and asserts zero per flow', () => {
    expect(
      exists('tests/e2e/csp-gate.spec.ts'),
      'tests/e2e/csp-gate.spec.ts'
    ).toBe(true);
    const source = read('tests/e2e/csp-gate.spec.ts');
    expect(source).toContain('csp-collector');
    expect(source).toContain('genuine-session');
    expect(source).toContain('/monitoring');
  });

  it('AC-02: playwright.config.ts lets BASE_URL point the same specs at a preview deploy', () => {
    expect(read('playwright.config.ts')).toContain('BASE_URL');
  });

  it('AC-01/AC-27: ship notes report 0 critical / 0 high, the Prisma version and the absent accelerate extension', () => {
    const rel = 'docs/features/security-patch/ship-notes.md';
    expect(exists(rel), rel).toBe(true);
    const notes = read(rel);
    expect(notes).toMatch(/0 critical/i);
    expect(notes).toMatch(/0 high/i);
    expect(notes).toContain(installedPrismaVersion());
    expect(notes).toContain('@prisma/extension-accelerate');
    expect(notes).toMatch(/dev(elopment)?-only/i);
  });

  it('AC-27: @prisma/extension-accelerate is not a dependency', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty(
      '@prisma/extension-accelerate'
    );
  });
});
