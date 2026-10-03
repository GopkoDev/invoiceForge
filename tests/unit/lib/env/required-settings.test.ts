// T10 (spec.md §5 AC-26, ADR-0008) - one list of required settings; the build fails and names
// every missing one; the list and env.example never drift apart.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OPTIONAL_SETTINGS,
  REQUIRED_SETTINGS,
  missingSettings,
  requireSetting,
} from '@/lib/env/required-settings';

const root = path.resolve(__dirname, '../../../..');

function fullEnv(): Record<string, string> {
  return Object.fromEntries(REQUIRED_SETTINGS.map((n) => [n, 'x']));
}

describe('required settings list (ADR-0008)', () => {
  it('contains the settings the ADR names', () => {
    for (const name of [
      'DATABASE_URL',
      'AUTH_SECRET',
      'AUTH_GOOGLE_ID',
      'AUTH_GOOGLE_SECRET',
      'EMAIL_SERVER_HOST',
      'EMAIL_SERVER_PORT',
      'EMAIL_SERVER_USER',
      'EMAIL_SERVER_PASSWORD',
      'NEXT_PUBLIC_SENTRY_DSN',
      'CRON_SECRET',
      'LIMIT_KEY_SECRET',
    ]) {
      expect(REQUIRED_SETTINGS).toContain(name);
    }
  });

  it('every required name appears in env.example under the exact name', () => {
    const example = readFileSync(path.join(root, 'env.example'), 'utf8');
    for (const name of REQUIRED_SETTINGS) {
      expect(example).toMatch(new RegExp(`^${name}=`, 'm'));
    }
  });

  // T24 / review F-11 (AC-26 "and the reverse holds too"): every setting app code reads is
  // documented in env.example. Platform-provided variables are the only exemption.
  it('every process.env.X read by app code appears in env.example', () => {
    const platformProvided = new Set(['CI', 'NEXT_RUNTIME']);
    const skip = new Set(['node_modules', '.next', '.git', 'tests', 'docs']);
    const roots = [
      'app',
      'components',
      'config',
      'constants',
      'hooks',
      'lib',
      'store',
      'types',
      'scripts',
    ];
    const rootFiles = readdirSync(root).filter((f) =>
      /^[^.].*\.(ts|tsx|mjs)$/.test(f)
    );
    const read = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (skip.has(entry)) continue;
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry)) scan(full);
      }
    };
    const scan = (file: string) => {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g))
        read.add(m[1]);
    };
    for (const r of roots) walk(path.join(root, r));
    for (const f of rootFiles) scan(path.join(root, f));
    const example = readFileSync(path.join(root, 'env.example'), 'utf8');
    const undocumented = [...read].filter(
      (name) =>
        !platformProvided.has(name) &&
        !new RegExp(`^#? ?${name}=`, 'm').test(example)
    );
    expect(read.size).toBeGreaterThan(0);
    expect(undocumented).toEqual([]);
  });

  it('missingSettings lists every missing name, treating empty as missing', () => {
    const env = fullEnv();
    delete env.CRON_SECRET;
    env.LIMIT_KEY_SECRET = '';
    expect(missingSettings(env).sort()).toEqual([
      'CRON_SECRET',
      'LIMIT_KEY_SECRET',
    ]);
    expect(missingSettings(fullEnv())).toEqual([]);
  });

  // T26 / review F-21: the response floor is tunable per environment but has a safe default,
  // so it is documented without failing a build that leaves it unset.
  it('lists SIGNIN_RESPONSE_FLOOR_MS as optional, documented in env.example, not required', () => {
    expect(OPTIONAL_SETTINGS).toContain('SIGNIN_RESPONSE_FLOOR_MS');
    expect(REQUIRED_SETTINGS).not.toContain('SIGNIN_RESPONSE_FLOOR_MS');
    const example = readFileSync(path.join(root, 'env.example'), 'utf8');
    for (const name of OPTIONAL_SETTINGS) {
      expect(example).toMatch(new RegExp(`^#? ?${name}=`, 'm'));
    }
  });

  it('requireSetting throws naming the setting', () => {
    delete process.env.CRON_SECRET;
    expect(() => requireSetting('CRON_SECRET')).toThrow(/CRON_SECRET/);
  });
});

describe('scripts/check-required-settings.ts (AC-26)', () => {
  const run = (env: Record<string, string>) =>
    spawnSync('node', ['scripts/check-required-settings.ts'], {
      cwd: root,
      env: {
        PATH: process.env.PATH ?? '',
        ...env,
      } as unknown as NodeJS.ProcessEnv,
      encoding: 'utf8',
    });

  it('exits non-zero and prints every missing name', () => {
    const env = fullEnv();
    delete env.CRON_SECRET;
    delete env.AUTH_GOOGLE_ID;
    const r = run(env);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('CRON_SECRET');
    expect(r.stdout + r.stderr).toContain('AUTH_GOOGLE_ID');
  });

  it('exits zero when nothing is missing', () => {
    expect(run(fullEnv()).status).toBe(0);
  });

  it('is the first step of pnpm build and dev is untouched', () => {
    const pkg = JSON.parse(
      readFileSync(path.join(root, 'package.json'), 'utf8')
    );
    expect(pkg.scripts.build).toMatch(/check-required-settings/);
    expect(pkg.scripts.build.indexOf('check-required-settings')).toBeLessThan(
      pkg.scripts.build.indexOf('next build')
    );
    expect(pkg.scripts.dev).not.toMatch(/check-required-settings/);
  });

  // T24 / review F-12: a local build loads .env before the check, and the Node floor that the
  // script's type stripping needs is pinned.
  it('the build loads .env when present and package.json pins the Node floor', () => {
    const pkg = JSON.parse(
      readFileSync(path.join(root, 'package.json'), 'utf8')
    );
    expect(pkg.scripts.build).toMatch(
      /node --env-file-if-exists=\.env scripts\/check-required-settings\.ts/
    );
    expect(pkg.engines?.node).toBe('>=22.18');
  });
});
