// editor-ux T14 (RED) — repository scan: the editor reaches the create/update server actions only
// through the store save command (ADR-0005), and nothing else repeats its post-save behaviour
// (the address replacement) outside it.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SKIP = new Set(['node_modules', '.next', '.worktrees', 'tests', 'docs', '.git']);
function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => p.slice(ROOT.length + 1);
const clientFiles = ['app', 'components', 'hooks', 'store', 'lib/hooks'].flatMap((d) => {
  try { return files(join(ROOT, d)); } catch { return []; }
});

describe('one save path', () => {
  it('only the store save command imports createInvoice / updateInvoice on the client', () => {
    const offenders = clientFiles
      .filter((f) => /import[^;]*\b(createInvoice|updateInvoice)\b[\s\S]*?invoice-actions/.test(readFileSync(f, 'utf8')))
      .map(rel)
      .filter((f) => f !== 'store/invoice-editor-store/save-command.ts');
    expect(offenders).toEqual([]);
  });

  it('the address replacement after a create lives in the save command, not in the header hook', () => {
    const hook = readFileSync(join(ROOT, 'hooks/use-editor-header-buttons.tsx'), 'utf8');
    const command = readFileSync(join(ROOT, 'store/invoice-editor-store/save-command.ts'), 'utf8');
    expect(command).toMatch(/replaceState/);
    expect(hook).not.toMatch(/replaceState|router\.replace/);
  });

  it('the header hook opens no changed-elsewhere or totals dialog itself', () => {
    const hook = readFileSync(join(ROOT, 'hooks/use-editor-header-buttons.tsx'), 'utf8');
    expect(hook).not.toMatch(/This invoice changed elsewhere|Confirm the new total/);
  });
});
