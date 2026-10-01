import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// T1 (service-layer): the lib/services boundary. Serves spec §6 NFRs
// "Business layer not reachable from the browser" and "Request-independence".
const root = process.cwd();

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

const read = (p: string) => readFileSync(p, 'utf8');
const firstStatement = (src: string) => src.replace(/^\s*(\/\/.*\n|\/\*[\s\S]*?\*\/)*\s*/g, '');
const rel = (p: string) => relative(root, p);

describe('lib/services boundary (T1)', () => {
  const serviceFiles = walk(join(root, 'lib/services'));

  it('has at least one real file under lib/services so the glob has a target', () => {
    expect(serviceFiles.length).toBeGreaterThan(0);
  });

  it('declares server-only as a dependency', () => {
    const pkg = JSON.parse(read(join(root, 'package.json')));
    expect(pkg.dependencies?.['server-only']).toBeTruthy();
  });

  it('no lib/services file starts with a use-server directive', () => {
    const offenders = serviceFiles.filter((f) => /^['"]use server['"]/.test(firstStatement(read(f))));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('every lib/services file imports server-only', () => {
    const offenders = serviceFiles.filter((f) => !/import\s+['"]server-only['"]/.test(read(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no use-client file imports lib/services', () => {
    const clientFiles = ['app', 'components', 'hooks']
      .flatMap((d) => walk(join(root, d)))
      .filter((f) => /^['"]use client['"]/.test(firstStatement(read(f))));
    const offenders = clientFiles.filter((f) =>
      /from\s+['"](@\/lib\/services|(\.\.?\/)+[^'"]*lib\/services)[^'"]*['"]/.test(read(f)),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no lib/services file imports from lib/actions (T25, S-12)', () => {
    const offenders = serviceFiles.filter((f) => /from\s+['"]@\/lib\/actions[^'"]*['"]|import\(\s*['"]@\/lib\/actions/.test(read(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('select-queries lives in lib/services/invoices and the lib/actions re-export shims are gone (T25, S-12)', () => {
    expect(existsSync(join(root, 'lib/services/invoices/select-queries.ts'))).toBe(true);
    for (const f of ['select-queries', 'helpers', 'numbering']) {
      expect(existsSync(join(root, `lib/actions/invoice-actions/${f}.ts`))).toBe(false);
    }
    expect(existsSync(join(root, 'lib/actions/action-result-helpers.ts'))).toBe(false);
  });

  it('runs pnpm build in the CI unit job', () => {
    expect(read(join(root, '.github/workflows/test.yml'))).toMatch(/run:\s*pnpm build/);
  });
});

describe('lib/services ESLint rules (T1)', () => {
  const eslint = new ESLint({ cwd: root });
  const lint = async (filePath: string, code: string) =>
    (await eslint.lintText(code, { filePath: join(root, filePath) }))[0].messages;
  const cast = `type ActingFreelancer = { id: string };\nexport const a = {} as ActingFreelancer;\n`;

  it.each(['next/headers', 'next/cache', 'next/navigation', '@/auth', 'next-auth', 'next-auth/react'])(
    'rejects import of %s under lib/services',
    async (mod) => {
      const msgs = await lint('lib/services/x/probe.ts', `import * as m from '${mod}';\nexport const a = m;\n`);
      expect(msgs.map((m) => m.ruleId)).toContain('no-restricted-imports');
    },
  );

  it('rejects imports of @/lib/actions under lib/services (T25, S-12)', async () => {
    const msgs = await lint(
      'lib/services/x/probe.ts',
      `import { failed } from '@/lib/actions/action-result-helpers';\nexport const a = failed;\n`,
    );
    expect(msgs.map((m) => m.ruleId)).toContain('no-restricted-imports');
  });

  it('rejects "as ActingFreelancer" casts outside the factory module', async () => {
    const inServices = await lint('lib/services/x/probe.ts', cast);
    expect(inServices.map((m) => m.ruleId)).toContain('no-restricted-syntax');
    const elsewhere = await lint('app/probe.ts', cast);
    expect(elsewhere.map((m) => m.ruleId)).toContain('no-restricted-syntax');
  });

  it('allows the cast inside lib/services/_shared/acting-freelancer.ts', async () => {
    const msgs = await lint('lib/services/_shared/acting-freelancer.ts', cast);
    expect(msgs.map((m) => m.ruleId)).not.toContain('no-restricted-syntax');
  });
});
