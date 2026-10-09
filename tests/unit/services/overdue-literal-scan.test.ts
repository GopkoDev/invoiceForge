// T02 (ADR-0005 hard rule) — a hand-written OVERDUE status check outside the shared module would
// bypass the rule. Only the display-only files in ALLOW_LIST may spell the derived status (T32).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const SCAN_DIRS = ['lib', 'app', 'components', 'types'];
const MODULE = 'lib/services/_shared/overdue.ts';

/**
 * Display-only callers that compare or list the DERIVED status the services already return
 * (ADR-0005). They never decide overdue-ness; each entry needs a written reason.
 */
const ALLOW_LIST: Readonly<Record<string, string>> = {
  'components/invoices/invoice-row-actions.tsx':
    'offers "Mark as paid" / "Mark as overdue" for the status the row already carries',
  'components/invoices/invoices-toolbar.tsx': 'the status filter option list',
  'components/dashboard/recent-invoices/dashboard-recent-invoices.tsx':
    'orders the already-derived recent rows by status',
  'types/invoice/types.ts': 'the status label/variant table for the badge',
  'lib/helpers/invoice-status.ts':
    'the stored-status lifecycle table (ADR-0002); its OVERDUE is the hand-marked stored status, never the derived one',
};

const OVERDUE_LITERAL = /\bOVERDUE\b/;

// Spelling the status without the literal ('overdue'.toUpperCase(), a shared OVERDUE_STATUS constant)
// would slip past OVERDUE_LITERAL, so the service layer may not use either form.
const OBFUSCATED_OVERDUE = /\bOVERDUE_STATUS\b|['"`]overdue['"`]\s*\.\s*toUpperCase/i;
const SERVICES_DIR = 'lib/services/';

function findOverdueLiterals(files: Record<string, string>, allow: readonly string[]): string[] {
  return Object.entries(files)
    .filter(([file, text]) => file !== MODULE && !allow.includes(file) && OVERDUE_LITERAL.test(text))
    .map(([file]) => file)
    .sort();
}

function findObfuscatedOverdue(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([file, text]) => file.startsWith(SERVICES_DIR) && OBFUSCATED_OVERDUE.test(text))
    .map(([file]) => file)
    .sort();
}

function walk(dir: string, out: Record<string, string>) {
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    const abs = path.join(ROOT, rel);
    if (statSync(abs).isDirectory()) {
      if (name !== 'node_modules' && name !== '.next') walk(rel, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out[rel] = readFileSync(abs, 'utf8');
    }
  }
}

function scanRepo(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const dir of SCAN_DIRS) walk(dir, files);
  return files;
}

describe('overdue literal scan', () => {
  it('flags a hand-written OVERDUE status check outside the module', () => {
    const files = {
      'lib/foo.ts': `where: { status: 'OVERDUE' }`,
      'lib/bar.ts': `SELECT 1 WHERE i."status" = 'OVERDUE'`,
      'lib/ok.ts': `const x = 1`,
      [MODULE]: `status = 'OVERDUE'`,
    };
    expect(findOverdueLiterals(files, [])).toEqual(['lib/bar.ts', 'lib/foo.ts']);
    expect(findOverdueLiterals(files, ['lib/foo.ts'])).toEqual(['lib/bar.ts']);
  });

  it('finds no OVERDUE literal in lib, app, components or types beyond the allow-list', () => {
    const files = scanRepo();
    expect(files[MODULE]).toBeDefined();
    expect(findOverdueLiterals(files, Object.keys(ALLOW_LIST))).toEqual([]);
  });

  it('keeps the allow-list honest: every entry still contains a literal', () => {
    const files = scanRepo();
    const stale = Object.keys(ALLOW_LIST).filter((f) => !OVERDUE_LITERAL.test(files[f] ?? ''));
    expect(stale).toEqual([]);
  });

  it('keeps the service layer out of the allow-list', () => {
    expect(Object.keys(ALLOW_LIST).filter((f) => f.startsWith(SERVICES_DIR))).toEqual([]);
  });

  it('flags an obfuscated overdue status in lib/services', () => {
    const files = {
      'lib/services/a.ts': `where: { status: OVERDUE_STATUS }`,
      'lib/services/b.ts': `const s = 'overdue'.toUpperCase();`,
      'lib/services/c.ts': `const s = "Overdue" .toUpperCase()`,
      'lib/services/ok.ts': `const n = name.toUpperCase();`,
      'components/x.tsx': `import { OVERDUE_STATUS } from '@/types'`,
    };
    expect(findObfuscatedOverdue(files)).toEqual([
      'lib/services/a.ts',
      'lib/services/b.ts',
      'lib/services/c.ts',
    ]);
  });

  it('finds no obfuscated overdue status in lib/services', () => {
    expect(findObfuscatedOverdue(scanRepo())).toEqual([]);
  });
});
