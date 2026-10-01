import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// T20 (service-layer): the move is closed and stays closed. Serves spec §5 AC-01, AC-07, AC-08, AC-10
// and KPIs 1-3 (0 data-store calls in the web layer, 100% request-free and foreign-record coverage).
const root = process.cwd();
const rel = (p: string) => relative(root, p);
const read = (p: string) => readFileSync(p, 'utf8');

function walk(dir: string, pattern = /\.(ts|tsx)$/): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p, pattern);
    return pattern.test(e.name) ? [p] : [];
  });
}

// Strip comments so a word in a comment is not a call.
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('part 1: no data-store calls in the web layer (KPI 1, AC-01)', () => {
  const files = [
    ...walk(join(root, 'lib/actions')).filter((f) => !f.endsWith('login-actions.ts')),
    ...walk(join(root, 'app'), /^route\.ts$/),
  ];

  it('scans a non-empty set including both route handlers', () => {
    const names = files.map(rel);
    expect(names).toContain('app/api/user/export/route.ts');
    expect(names).toContain('app/api/convert-image/route.ts');
    expect(files.length).toBeGreaterThan(10);
  });

  it('no file imports the prisma client or a runtime value from @prisma/client, or uses prisma.', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = code(read(f));
      const lines: string[] = [];
      for (const m of src.matchAll(/import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
        const [, typeOnly, spec, from] = m;
        if (/^@\/(lib\/)?prisma(\/|$)/.test(from) || /(^|\/)prisma$/.test(from)) lines.push(m[0]);
        if (from === '@prisma/client' && !typeOnly) {
          const named = spec
            .replace(/[{}]/g, '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          if (named.some((n) => !n.startsWith('type '))) lines.push(m[0]);
        }
      }
      if (/\bprisma\s*\./.test(src)) lines.push('prisma.<usage>');
      if (lines.length) offenders.push(`${rel(f)}: ${lines.join(' | ').replace(/\s+/g, ' ')}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('part 2: every business function has request-free and foreign-record tests (KPI 2-3, AC-07, AC-08)', () => {
  // Plumbing exported from lib/services files; not business functions of public-api §2.
  const NOT_BUSINESS_FILES = [
    /invoices\/helpers\.ts$/,
    /invoices\/numbering\.ts$/,
    /dashboard\/queries\.ts$/,
    /dashboard\/period\.ts$/,
    /services\/index\.ts$/,
  ];
  const NOT_BUSINESS_NAMES = new Set(['resolveManualOrAllocatedNumber', 'invoiceNumberConflict']);

  type Fn = { name: string; file: string; takesId: boolean };
  const functions: Fn[] = walk(join(root, 'lib/services'))
    .filter((f) => !f.includes('/_shared/') && !NOT_BUSINESS_FILES.some((r) => r.test(f)))
    .flatMap((f) => {
      const src = code(read(f));
      return [...src.matchAll(/export\s+async\s+function\s+(\w+)\s*(?:<[^>]*>)?\(([\s\S]*?)\)\s*(?::|\{)/g)]
        .filter((m) => !NOT_BUSINESS_NAMES.has(m[1]))
        .map((m) => {
          const params = m[2].split(',').map((p) => p.trim().split(/[:=?]/)[0].trim());
          return { name: m[1], file: rel(f), takesId: params.slice(1).some((p) => p === 'id' || /Id$/.test(p)) };
        });
    });

  const testFiles = walk(join(root, 'tests/integration/services'), /\.test\.ts$/).map((f) => ({
    path: rel(f),
    src: read(f),
  }));
  const wordRe = (n: string) => new RegExp(`\\b${n}\\b`);

  it('finds the business functions', () => {
    expect(functions.length).toBeGreaterThan(40);
    expect(functions.map((f) => f.name)).toEqual(
      expect.arrayContaining(['getCustomer', 'deleteInvoice', 'getSummaryStats']),
    );
  });

  it('every function has a request-free test (calls it with actingFreelancerForTest, no @/auth mock)', () => {
    const missing = functions.filter(
      (fn) =>
        !testFiles.some(
          (t) =>
            /actingFreelancerForTest/.test(t.src) &&
            !/vi\.mock\(\s*['"]@\/auth['"]/.test(t.src) &&
            wordRe(fn.name).test(t.src),
        ),
    );
    expect(missing.map((f) => `${f.file}: ${f.name}`)).toEqual([]);
  });

  it('every id-taking function has a foreign-record test (a titled it/describe naming it and Freelancer B)', () => {
    const titleRe = /(?:it|describe|test)(?:\.\w+(?:\([^)]*\))?)*\(\s*([`'"])((?:(?!\1)[\s\S])*?)\1/g;
    const isForeignTitle = (t: string) => /foreign|\bB['’]?s?\b/.test(t);
    const missing = functions
      .filter((fn) => fn.takesId)
      .filter(
        (fn) =>
          !testFiles.some((t) => {
            if (!/NOT_FOUND/.test(t.src)) return false;
            const titles = [...t.src.matchAll(titleRe)].map((m) => m[2]);
            const namesFn = titles.some((x) => wordRe(fn.name).test(x));
            // Either a foreign-record suite file (its titles name the function), or a titled foreign case in a file whose titles name it.
            const foreignFile = /foreign-record/.test(t.path);
            return namesFn && (foreignFile || titles.some(isForeignTitle));
          }),
      );
    expect(missing.map((f) => `${f.file}: ${f.name}`)).toEqual([]);
  });
});

describe('part 3: every use-server action builds the ActingFreelancer first (AC-10)', () => {
  const actionFiles = walk(join(root, 'lib/actions')).filter(
    (f) => !f.endsWith('login-actions.ts') && /^['"]use server['"]/.test(code(read(f)).trimStart()),
  );

  it('finds the action files', () => {
    expect(actionFiles.length).toBeGreaterThan(8);
  });

  it('each exported function calls actingFreelancerFromSession() before any other await', () => {
    const offenders: string[] = [];
    for (const f of actionFiles) {
      const src = code(read(f));
      const parts = src.split(/^export\s+async\s+function\s+/m).slice(1);
      for (const part of parts) {
        const name = part.match(/^(\w+)/)![1];
        const body = part.slice(part.indexOf(')'));
        const firstAwait = body.search(/\bawait\b/);
        const ok = firstAwait !== -1 && body.slice(firstAwait, firstAwait + 60).includes('actingFreelancerFromSession(');
        if (!ok) offenders.push(`${rel(f)}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
