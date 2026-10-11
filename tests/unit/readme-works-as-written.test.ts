// AC-15: the README's setup and test steps work as written (static check).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const readme = readFileSync(path.join(root, 'README.md'), 'utf8');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const scripts = Object.keys(pkg.scripts as Record<string, string>);

const PNPM_BUILTINS = new Set([
  'install',
  'i',
  'add',
  'exec',
  'dlx',
  'run',
  'test',
  'start',
  'prisma',
  'playwright',
]);
const EXAMPLE_ENV = 'env.example';

function codeBlocks(md: string): string {
  return [...md.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');
}

describe('README works as written (AC-15)', () => {
  it('every `pnpm <script>` it tells you to run exists in package.json or is a pnpm builtin', () => {
    const cmds = [
      ...codeBlocks(readme).matchAll(/^\s*pnpm\s+(?:run\s+)?([\w:.-]+)/gm),
      ...[...readme.matchAll(/`pnpm\s+(?:run\s+)?([\w:.-]+)[^`]*`/g)],
    ].map((m) => m[1]);
    expect(cmds.length).toBeGreaterThan(0);
    const bad = cmds.filter((c) => !scripts.includes(c) && !PNPM_BUILTINS.has(c));
    expect(bad).toEqual([]);
  });

  it('the setup does not use a script that is missing (db setup via real scripts/builtins)', () => {
    expect(readme).toMatch(/pnpm install/);
    expect(readme).toMatch(/pnpm (run )?dev\b/);
  });

  it('every relative markdown link target exists on disk', () => {
    const links = [...readme.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)].map((m) =>
      m[1].split('#')[0],
    );
    const missing = links.filter((l) => l && !existsSync(path.join(root, l)));
    expect(missing).toEqual([]);
  });

  it('every repo file named in backticks exists on disk', () => {
    const named = [...readme.matchAll(/`([\w./-]+\.(?:md|example|ts|json|mjs|env))`/g)].map(
      (m) => m[1],
    );
    const missing = named.filter((f) => !existsSync(path.join(root, f)));
    expect(missing).toEqual([]);
  });

  it('names the example env file that actually exists, and copies it', () => {
    expect(existsSync(path.join(root, EXAMPLE_ENV))).toBe(true);
    expect(readme).toContain(`cp ${EXAMPLE_ENV} .env`);
    expect(readme).not.toContain('.env.example');
  });

  it('tells the Contributor to provide their own PostgreSQL and the listed settings', () => {
    expect(readme).toMatch(/your own[^\n]*PostgreSQL|own[^\n]*PostgreSQL database/i);
    const example = readFileSync(path.join(root, EXAMPLE_ENV), 'utf8');
    expect(readme).toContain('DATABASE_URL');
    expect(readme).toContain('AUTH_SECRET');
    for (const name of ['CRON_SECRET', 'LIMIT_KEY_SECRET']) {
      expect(example).toMatch(new RegExp(`^${name}=`, 'm'));
      expect(readme).toContain(name);
    }
  });

  it('says which tests need the database and shows how to run the tests', () => {
    expect(readme).toMatch(/pnpm test\b(?!:)/);
    expect(readme).toMatch(/test:integration[^\n]*(database|PostgreSQL)|(database|PostgreSQL)[^\n]*test:integration/i);
    expect(readme).toMatch(/test:e2e[^\n]*(database|PostgreSQL)|(database|PostgreSQL)[^\n]*test:e2e/i);
  });

  it('links the testing guide, which exists', () => {
    expect(existsSync(path.join(root, 'tests/README.md'))).toBe(true);
    expect(readme).toMatch(/\]\(\.?\/?tests\/README\.md\)/);
  });

  it('contains no connection URL with a real host and no secret-looking value', () => {
    const urls = [...readme.matchAll(/postgres(?:ql)?:\/\/[^\s'"`)]*@([^\s/:'"`?]+)/g)];
    const allowed = new Set(['localhost', '127.0.0.1', 'HOST', 'host', '<host>']);
    expect(urls.filter((u) => !allowed.has(u[1]))).toEqual([]);
    expect(readme).not.toMatch(/\b[A-Za-z0-9+/_-]{32,}={0,2}/);
    expect(readme).not.toMatch(/neon\.tech|supabase\.co|vercel-storage|rds\.amazonaws/i);
  });

  it('the example env file holds placeholders only', () => {
    const example = readFileSync(path.join(root, EXAMPLE_ENV), 'utf8');
    expect(example).not.toMatch(/neon\.tech|supabase\.co|vercel-storage|rds\.amazonaws/i);
    const values = [...example.matchAll(/^[A-Z][A-Z0-9_]*=["']?([^"'\n]*)["']?[ \t]*$/gm)].map((m) => m[1]);
    const secretLike = values.filter(
      (v) => /^[A-Za-z0-9+/_=-]{32,}$/.test(v) && !/^(generate|your|change|example|placeholder)/i.test(v),
    );
    expect(secretLike).toEqual([]);
    const hosts = [...example.matchAll(/postgres(?:ql)?:\/\/[^@\s]*@([^\s/:?"']+)/g)].map((m) => m[1]);
    expect(hosts.filter((h) => !['localhost', '127.0.0.1', 'HOST'].includes(h))).toEqual([]);
  });
});
