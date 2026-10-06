// AC-26 (ADR-0008): one list of required settings; the build fails and names
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

function readEnvExample(): string {
  return readFileSync(path.join(root, 'env.example'), 'utf8');
}

/**
 * The setting names one source file reads directly: `process.env.X`, `process.env['X']` and
 * `process.env["X"]`, each also with `?.`, plus destructuring `const { X, Y: alias } = process.env`,
 * typed or with comments inside the braces.
 */
function envReadsIn(source: string): string[] {
  // A parameter that defaults to process.env (`env = process.env`) is an injected
  // record; `<param>.X` and `<param>['X']` on it are reads too.
  const records = [
    'process\\.env',
    ...[
      ...source.matchAll(
        /\b([A-Za-z_$][\w$]*)\s*(?::[^=)]+)?=\s*process\.env\b(?!\s*(?:\?\.|[.[]))/g
      ),
    ].map((m) => m[1]),
  ].join('|');
  const accessed = [
    ...source.matchAll(
      new RegExp(
        `\\b(?:${records})\\s*(?:\\??\\.\\s*([A-Z][A-Z0-9_]*)|(?:\\?\\.)?\\[\\s*['"]([A-Z][A-Z0-9_]*)['"]\\s*\\])`,
        'g'
      )
    ),
  ].map((m) => m[1] ?? m[2]);
  // `{ X, Y: alias, Z = 'default' } = process.env`: the key before `:` or `=` is the name read.
  // A type annotation may sit between `}` and `=`, and comments inside the braces
  // are dropped before splitting so they don't glue onto the next name.
  // String literals are blanked first, so a `//` in a URL default is not a comment.
  const destructured = [
    ...source.matchAll(
      new RegExp(
        `\\{([^{}]*)\\}\\s*(?::[^=]+)?=\\s*(?:${records})\\b(?!\\s*(?:\\?\\.|[.[]))`,
        'g'
      )
    ),
  ].flatMap((m) =>
    m[1]
      .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''")
      .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
      .split(',')
      .map((part) => part.split(/[:=]/)[0].trim())
      .filter((name) => /^[A-Z][A-Z0-9_]*$/.test(name))
  );
  return [...accessed, ...destructured];
}

/** Every setting name app code reads directly (see envReadsIn). */
function scannedEnvReads(): Set<string> {
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
  const scan = (file: string) => {
    for (const name of envReadsIn(readFileSync(file, 'utf8'))) read.add(name);
  };
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|mjs)$/.test(entry)) scan(full);
    }
  };
  for (const r of roots) walk(path.join(root, r));
  for (const f of rootFiles) scan(path.join(root, f));
  return read;
}

/** Every name env.example documents, set (`X=`) or commented out (`# X=`). */
function envExampleNames(example: string): string[] {
  return [...example.matchAll(/^#? ?([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);
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

  // AC-26: platform-provided variables are the only exemption.
  it('every process.env.X read by app code appears in env.example', () => {
    const platformProvided = new Set(['CI', 'NEXT_RUNTIME', 'VERCEL']);
    const read = scannedEnvReads();
    const example = readEnvExample();
    const undocumented = [...read].filter(
      (name) =>
        !platformProvided.has(name) &&
        !new RegExp(`^#? ?${name}=`, 'm').test(example)
    );
    expect(read.size).toBeGreaterThan(0);
    expect(undocumented).toEqual([]);
  });

  // AC-26: a stale name in env.example would send an operator to set something nothing reads.
  it('every env.example name is a setting the app reads', () => {
    // Read by a framework or build tool rather than by app code, so the scan can't see them.
    const frameworkOrBuild = new Map([
      ['AUTH_URL', 'next-auth reads it for the canonical base URL'],
      [
        'SENTRY_AUTH_TOKEN',
        '@sentry/nextjs build plugin uploads source maps with it',
      ],
    ]);
    const used = new Set<string>([
      ...REQUIRED_SETTINGS,
      ...OPTIONAL_SETTINGS,
      ...scannedEnvReads(),
      ...frameworkOrBuild.keys(),
    ]);
    const names = envExampleNames(readEnvExample());

    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => !used.has(name))).toEqual([]);
  });

  it("the scan sees bracket reads (prisma.config.ts reads process.env['DATABASE_URL'])", () => {
    expect(
      envReadsIn(
        `const a = process.env.DOT_READ; const b = process.env['SINGLE_QUOTED']; ` +
          `const c = process.env[ "DOUBLE_QUOTED" ];`
      )
    ).toEqual(['DOT_READ', 'SINGLE_QUOTED', 'DOUBLE_QUOTED']);
    expect(
      envReadsIn(readFileSync(path.join(root, 'prisma.config.ts'), 'utf8'))
    ).toContain('DATABASE_URL');
  });

  it('the scan sees reads through a parameter that defaults to process.env', () => {
    expect(
      envReadsIn(
        `function f(env: Record<string, string | undefined> = process.env) { return env.INJECTED_ONE; }\n` +
          `const g = (e = process.env) => e['INJECTED_TWO'];\n` +
          `const h = (other: Foo) => other.NOT_A_SETTING;`
      ).sort()
    ).toEqual(['INJECTED_ONE', 'INJECTED_TWO']);
    expect(
      envReadsIn(
        readFileSync(path.join(root, 'lib/auth/email-provider.ts'), 'utf8')
      )
    ).toContain('SIGNIN_RESPONSE_FLOOR_MS');
  });

  it('the scan sees optional-chained and destructured reads', () => {
    expect(
      envReadsIn(
        `const a = process.env?.OPTIONAL_DOT; const b = process.env?.['OPTIONAL_BRACKET'];\n` +
          `function f(env = process.env) { return env?.INJECTED_OPTIONAL; }\n` +
          `const { DESTRUCTURED_ONE } = process.env;\n` +
          `const { DESTRUCTURED_TWO, DESTRUCTURED_THREE: alias, DESTRUCTURED_FOUR = 'd' } =\n` +
          `  process.env;\n` +
          `const { notASetting } = other;\n` +
          `function g(env = process.env ?? {}) { return env.NULLISH_INJECTED; }\n` +
          `const { NULLISH_DESTRUCTURED } = process.env ?? {};`
      ).sort()
    ).toEqual([
      'DESTRUCTURED_FOUR',
      'DESTRUCTURED_ONE',
      'DESTRUCTURED_THREE',
      'DESTRUCTURED_TWO',
      'INJECTED_OPTIONAL',
      'NULLISH_DESTRUCTURED',
      'NULLISH_INJECTED',
      'OPTIONAL_BRACKET',
      'OPTIONAL_DOT',
    ]);
  });

  it('the scan sees typed and commented destructured reads', () => {
    expect(
      envReadsIn(
        `const { TYPED_ONE }: NodeJS.ProcessEnv = process.env;\n` +
          `const {\n  COMMENTED_ONE, // why\n  COMMENTED_TWO, /* block, note */\n  COMMENTED_THREE: alias,\n} = process.env;`
      ).sort()
    ).toEqual(['COMMENTED_ONE', 'COMMENTED_THREE', 'COMMENTED_TWO', 'TYPED_ONE']);
  });

  // A `//` inside a string default is not a comment.
  it('the scan keeps the destructured name after a URL default', () => {
    expect(
      envReadsIn(
        `const { BASE_URL = 'https://x.example', AFTER_URL } = process.env;\n` +
          `const {\n  QUOTED_URL = "http://y.example/*",\n  AFTER_QUOTED,\n  TICK_URL = \`//z\`,\n  AFTER_TICK, // note\n} = process.env;`
      ).sort()
    ).toEqual(['AFTER_QUOTED', 'AFTER_TICK', 'AFTER_URL', 'BASE_URL', 'QUOTED_URL', 'TICK_URL']);
  });

  it('the env.example parser picks up a bare or commented-out stale entry', () => {
    expect(
      envExampleNames('GOOGLE_CLIENT_ID=\n# OLD_SETTING=1\nNOT A SETTING\n')
    ).toEqual(['GOOGLE_CLIENT_ID', 'OLD_SETTING']);
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

  // The response floor is tunable per environment but has a safe default,
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

  // The Node floor the script's type stripping needs is pinned, and the major too, so Vercel can't
  // pick Node 24 while CI runs 22; .nvmrc is the single source CI reads.
  it('the build loads .env when present and package.json pins Node 22 from 22.18', () => {
    const pkg = JSON.parse(
      readFileSync(path.join(root, 'package.json'), 'utf8')
    );
    expect(pkg.scripts.build).toMatch(
      /node --env-file-if-exists=\.env scripts\/check-required-settings\.ts/
    );
    expect(pkg.engines?.node).toBe('>=22.18 <23');
  });

  it('.nvmrc pins Node 22 and every CI setup-node step reads it', () => {
    expect(readFileSync(path.join(root, '.nvmrc'), 'utf8').trim()).toBe('22');

    const workflow = readFileSync(
      path.join(root, '.github/workflows/test.yml'),
      'utf8'
    );
    const setupSteps = workflow.split('uses: actions/setup-node@').slice(1);
    expect(setupSteps.length).toBeGreaterThan(0);
    for (const step of setupSteps) {
      const withBlock = step.split(/\n\s*- /)[0];
      expect(withBlock).toMatch(/node-version-file:\s*\.nvmrc/);
      expect(withBlock).not.toMatch(/node-version:/);
    }
  });
});
