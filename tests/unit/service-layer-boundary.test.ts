import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it, vi } from 'vitest';

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
// Every module specifier: `from '…'`, side-effect `import '…'`, `import(…)` and `require(…)`, in any quote.
// A template literal contributes its static prefix (up to the first `${`).
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"`])([^'"`$]*)/g;
const targetsActions = (spec: string, file: string) => {
  if (/^(?:@\/)?lib\/actions(?:\/|$)/.test(spec)) return true;
  if (!spec.startsWith('.')) return false;
  const inActions = relative(join(root, 'lib/actions'), resolve(root, dirname(file), spec));
  return inActions === '' || (!inActions.startsWith('..') && !isAbsolute(inActions));
};
const importsActions = (src: string, file = 'lib/services/x/probe.ts') =>
  [...src.matchAll(SPECIFIER)].some((m) => targetsActions(m[2], file));
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
    const offenders = serviceFiles.filter((f) => importsActions(read(f), rel(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('the boundary matcher also rejects relative imports into lib/actions (T29, R-09)', () => {
    expect(importsActions(`import { x } from '../../actions/x';`)).toBe(true);
    expect(importsActions(`import { x } from '../../../lib/actions/invoice-actions/y';`)).toBe(true);
    expect(importsActions(`const m = await import('../../actions/x');`)).toBe(true);
    expect(importsActions(`import { x } from '@/lib/actions/x';`)).toBe(true);
    expect(importsActions(`import { x } from '../_shared/x';`)).toBe(false);
  });

  it('the boundary matcher catches every import form and resolves relative paths (T31, N-2)', () => {
    for (const src of [
      `import '../../actions/x';`,
      `import '@/lib/actions/x';`,
      `export { x } from '../../actions/x';`,
      `const m = require('../../actions/x');`,
      `// eslint-disable-next-line @typescript-eslint/no-require-imports\nconst m = require("@/lib/actions/x");`,
      'const m = await import(`../../actions/${name}`);',
      'const m = await import(`@/lib/actions/x`);',
      `import { x } from 'lib/actions/x';`,
      `import { x } from 'lib/actions';`,
    ]) {
      expect(importsActions(src), src).toBe(true);
    }
    // A local module that happens to be called "actions" is not lib/actions.
    expect(importsActions(`import { x } from './actions';`)).toBe(false);
    expect(importsActions(`import { x } from '../actions/x';`)).toBe(false);
    expect(importsActions(`import { x } from '../actions/x';`, 'lib/services/probe.ts')).toBe(true);
  });

  it('select-queries lives in lib/services/invoices and the lib/actions re-export shims are gone (T25, S-12)', () => {
    expect(existsSync(join(root, 'lib/services/invoices/select-queries.ts'))).toBe(true);
    for (const f of ['select-queries', 'helpers', 'numbering']) {
      expect(existsSync(join(root, `lib/actions/invoice-actions/${f}.ts`))).toBe(false);
    }
    expect(existsSync(join(root, 'lib/actions/action-result-helpers.ts'))).toBe(false);
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

  const boundaryRules = ['no-restricted-imports', 'import/no-restricted-paths'];
  const hitsBoundary = (msgs: { ruleId: string | null }[]) => msgs.some((m) => boundaryRules.includes(m.ruleId ?? ''));

  it('rejects relative imports of lib/actions under lib/services (T29, R-09)', async () => {
    for (const spec of ['../../actions/invoice-actions/invoice-actions', '../../../lib/actions/customer-actions']) {
      const msgs = await lint('lib/services/x/probe.ts', `import { f } from '${spec}';\nexport const a = f;\n`);
      expect(hitsBoundary(msgs), spec).toBe(true);
    }
  });

  it('rejects side-effect, dynamic, require and baseUrl imports of lib/actions under lib/services (T31, N-2)', async () => {
    for (const code of [
      `import '@/lib/actions/customer-actions';\n`,
      `import '../../actions/customer-actions';\n`,
      `export const a = () => import('../../actions/customer-actions');\n`,
      `export const a = () => import('@/lib/actions/customer-actions');\n`,
      `// eslint-disable-next-line @typescript-eslint/no-require-imports\nexport const a = require('../../actions/customer-actions');\n`,
      `import { f } from 'lib/actions/customer-actions';\nexport const a = f;\n`,
    ]) {
      expect(hitsBoundary(await lint('lib/services/x/probe.ts', code)), code).toBe(true);
    }
  });

  it('rejects relative imports of lib/actions when ESLint runs from inside lib/services (T32, S-1)', async () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(join(root, 'lib/services'));
    try {
      const msgs = await lint(
        'lib/services/x/probe.ts',
        `import { f } from '../../actions/customer-actions';\nexport const a = f;\n`,
      );
      expect(msgs.map((m) => m.ruleId)).toContain('import/no-restricted-paths');
    } finally {
      cwd.mockRestore();
    }
  });

  it('allows a local module named actions under lib/services (T31, N-2)', async () => {
    const msgs = await lint('lib/services/x/probe.ts', `import { f } from './actions';\nexport const a = f;\n`);
    expect(hitsBoundary(msgs)).toBe(false);
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
