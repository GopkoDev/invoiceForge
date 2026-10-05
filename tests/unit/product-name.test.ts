import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The product is "Invoice Forge" (config/site.config.ts). "invoiceFlow" and its spellings are the
// old working name and must not reach a Freelancer, an Assistant or a test.
const root = process.cwd();
const SCANNED = [
  'app',
  'components',
  'config',
  'constants',
  'hooks',
  'lib',
  'store',
  'types',
  'tests',
  'proxy.ts',
  'CONTEXT.md',
  'README.md',
  'docs',
];
const OLD_NAME = /invoi?ce[\s_-]?flow/i;

function files(path: string): string[] {
  const full = join(root, path);
  let entries;
  try {
    entries = readdirSync(full, { withFileTypes: true });
  } catch {
    return [full];
  }
  return entries.flatMap((e) => files(join(path, e.name)));
}

describe('product name', () => {
  it('never uses the old working name invoiceFlow', () => {
    const offenders = SCANNED.flatMap(files)
      .filter((f) => /\.(ts|tsx|mjs|js|json|md|ya?ml|sql)$/.test(f))
      .filter((f) => !f.endsWith('product-name.test.ts'))
      // Fix records quote the old name on purpose.
      .filter((f) => !f.includes('/_fixes/'))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) =>
            OLD_NAME.test(line) ? `${relative(root, f)}:${i + 1}` : null
          )
          .filter((x): x is string => x !== null)
      );

    expect(offenders).toEqual([]);
  });
});
