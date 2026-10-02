// T10 (spec.md §5 AC-26, ADR-0008) - one list of required settings; the build fails and names
// every missing one; the list and env.example never drift apart.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
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
});
