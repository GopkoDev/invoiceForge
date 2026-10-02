import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// T2 / AC-27: Prisma on latest 7.x, @prisma/extension-accelerate removed.
const root = process.cwd();
const LATEST_7X_MIN = [7, 10, 0];

function installedVersion(pkg: string): string {
  let dir = join(root, 'node_modules', ...pkg.split('/'));
  for (;;) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      const manifest = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: string; version: string };
      if (manifest.name === pkg) return manifest.version;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`package.json for ${pkg} not found`);
    dir = parent;
  }
}

function atLeast(actual: string, min: number[]): boolean {
  const a = actual.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== min[i]) return a[i] > min[i];
  }
  return true;
}

describe('T2 Prisma upgrade and accelerate removal (AC-27)', () => {
  for (const pkg of ['@prisma/client', 'prisma', '@prisma/adapter-pg']) {
    it(`${pkg} is installed on the latest 7.x`, () => {
      const v = installedVersion(pkg);
      expect(v).toMatch(/^7\.\d+\.\d+$/);
      expect(atLeast(v, LATEST_7X_MIN)).toBe(true);
    });
  }

  it('@prisma/extension-accelerate is not a dependency', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<
      string,
      Record<string, string>
    >;
    const declared = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies };
    expect(Object.keys(declared)).not.toContain('@prisma/extension-accelerate');
  });

  it('@prisma/extension-accelerate is absent from the lockfile', () => {
    expect(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')).not.toContain('extension-accelerate');
  });
});
