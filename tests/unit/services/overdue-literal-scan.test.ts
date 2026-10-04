// T02 (ADR-0005 hard rule) — a hand-written OVERDUE status check outside the shared module would
// bypass the rule. T06/T07/T08 remove the allow-list entries below; T08's DoD leaves it empty.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const SCAN_DIRS = ['lib', 'app', 'components', 'types'];
const MODULE = 'lib/services/_shared/overdue.ts';

/** Temporary allow-list: callers that still hand-write OVERDUE (removed by T06/T07/T08). */
const ALLOW_LIST: readonly string[] = [];

const OVERDUE_LITERAL = /\bOVERDUE\b/;

function findOverdueLiterals(files: Record<string, string>, allow: readonly string[]): string[] {
  return Object.entries(files)
    .filter(([file, text]) => file !== MODULE && !allow.includes(file) && OVERDUE_LITERAL.test(text))
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
    expect(findOverdueLiterals(files, ALLOW_LIST)).toEqual([]);
  });

  it('keeps the allow-list honest: every entry still contains a literal', () => {
    const files = scanRepo();
    const stale = ALLOW_LIST.filter((f) => !OVERDUE_LITERAL.test(files[f] ?? ''));
    expect(stale).toEqual([]);
  });
});
