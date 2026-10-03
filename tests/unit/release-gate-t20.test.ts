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

  it('AC-27: ship notes record the Prisma version, the absent accelerate extension and dev-only advisories', () => {
    const rel = 'docs/features/security-patch/ship-notes.md';
    expect(exists(rel), rel).toBe(true);
    const notes = read(rel);
    expect(notes).toContain(installedPrismaVersion());
    expect(notes).toContain('@prisma/extension-accelerate');
    expect(notes).toMatch(/dev(elopment)?-only/i);
  });

  // T24 / review F-10: the audit gate is a real command on the dependency graph, not a grep of
  // the ship notes.
  it('AC-01: CI runs the production audit at high severity in the unit job', () => {
    const workflow = read('.github/workflows/test.yml');
    expect(workflow).toContain('pnpm audit --prod --audit-level=high');
  });

  // T24 / review F-08: the direct uuid dependency is at the patched release.
  it('AC-27: uuid is a patched release (>= 13.0.1) in the manifest and the lockfile', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies.uuid).toBe('^13.0.1');
    expect(read('pnpm-lock.yaml')).not.toMatch(/uuid@13\.0\.0\b/);
  });

  // T24 / review F-09: GHSA-4x5r-pxfx-6jf8 is patched in @babel/core 7.29.6, which every
  // dependant's declared ^7 range accepts, so the workspace overrides it like the other
  // transitive advisories and no older copy is left in the lockfile.
  it('AC-01: @babel/core is overridden to the patched release and the lockfile has no older copy', () => {
    expect(read('pnpm-workspace.yaml')).toMatch(
      /^\s+'?@babel\/core@<7\.29\.6'?: \^7\.29\.6$/m
    );
    const versions = [
      ...read('pnpm-lock.yaml').matchAll(/@babel\/core@(\d+)\.(\d+)\.(\d+)/g),
    ].map((m) => m.slice(1, 4).map(Number));
    expect(versions.length).toBeGreaterThan(0);
    const unpatched = versions.filter(
      ([major, minor, patch]) =>
        major === 7 && (minor < 29 || (minor === 29 && patch < 6))
    );
    expect(unpatched.map((v) => v.join('.'))).toEqual([]);
  });

  // T24 / review F-09, F-13: every moderate/low dev advisory is explained and the nodemailer
  // peer-range deviation is recorded.
  it('AC-01: ship notes explain the moderate and low advisories and the nodemailer peer range', () => {
    const notes = read('docs/features/security-patch/ship-notes.md');
    expect(notes).toMatch(/moderate and low/i);
    expect(notes).toContain('@babel/core');
    expect(notes).toContain('nodemailer');
    expect(notes).toMatch(/peer range/i);
    expect(notes).toContain('sendVerificationRequest');
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
