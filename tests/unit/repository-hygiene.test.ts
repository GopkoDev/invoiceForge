import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function emptyDirectories(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  if (entries.length === 0) return [dir];
  return entries
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => emptyDirectories(join(dir, entry.name)));
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  '.worktrees',
  'docs',
  'coverage',
  'playwright-report',
  'test-results',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/**
 * True when source renders its own dialog: a dialog/alert-dialog primitive import or a *Modal component.
 * Owner decision 2026-10-10 (review-2026-10-10 T37): the phone "View PDF" Sheet in the resize panels is the
 * narrow-screen form of the preview panel (ADR-0004, CSS-only layout), not an editor dialog, so
 * `@/components/ui/sheet` is deliberately not scanned.
 */
function rendersOwnDialog(text: string): boolean {
  return (
    /from\s+['"]@\/components\/ui\/(dialog|alert-dialog)['"]/.test(text) ||
    // The primitives under the shared ones and the plain element: an editor dialog built from any of
    // them would also be a dialog outside the editor's dialog host.
    /from\s+['"]@radix-ui\/react-(alert-)?dialog['"]/.test(text) ||
    /from\s+['"]vaul['"]/.test(text) ||
    /<dialog[\s>/]/.test(text) ||
    /\b\w*Modal\b/.test(text.replace(/\buse\w*Modal\w*\b/g, ''))
  );
}

const rel = (file: string) => file.slice(root.length + 1);

/** ui component names reachable from non-ui code, following ui -> ui imports. */
function usedUiComponents(): { all: string[]; used: Set<string> } {
  const uiDir = join(root, 'components/ui');
  const all = readdirSync(uiDir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => f.replace(/\.tsx$/, ''));
  const refs = (text: string) => {
    const names = new Set<string>();
    for (const m of text.matchAll(
      /from\s+['"](?:@\/components\/ui\/|\.\/)([\w-]+)['"]/g
    )) {
      names.add(m[1]);
    }
    return names;
  };
  const used = new Set<string>();
  const queue: string[] = [];
  for (const file of sourceFiles(root)) {
    if (rel(file).startsWith('components/ui/')) continue;
    for (const name of refs(readFileSync(file, 'utf8'))) {
      if (!used.has(name) && all.includes(name)) {
        used.add(name);
        queue.push(name);
      }
    }
  }
  while (queue.length > 0) {
    const name = queue.pop() as string;
    for (const dep of refs(readFileSync(join(uiDir, `${name}.tsx`), 'utf8'))) {
      if (!used.has(dep) && all.includes(dep)) {
        used.add(dep);
        queue.push(dep);
      }
    }
  }
  return { all, used };
}

describe('repository hygiene (spec §6, F4–F6)', () => {
  it('declares the sdd marketplace in the shared Claude settings (F4)', () => {
    const settings = JSON.parse(
      readFileSync(join(root, '.claude/settings.json'), 'utf8')
    );

    expect(settings.extraKnownMarketplaces?.sdd?.source).toEqual({
      source: 'github',
      repo: 'genkovich/sdd',
    });
    expect(settings.enabledPlugins?.['sdd@sdd']).toBe(true);
  });

  it('git-ignores personal Claude settings (F5)', () => {
    const ignoreRules = readFileSync(join(root, '.gitignore'), 'utf8').split(
      '\n'
    );

    expect(ignoreRules).toContain('.claude/settings.local.json');
  });

  it('has no empty route folders under app/ (F6)', () => {
    expect(
      emptyDirectories(join(root, 'app')).map((dir) =>
        dir.slice(root.length + 1)
      )
    ).toEqual([]);
  });
});

describe('unused code removal (AC-16, T4)', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };

  it('components/ui holds no component that the app does not use', () => {
    const { all, used } = usedUiComponents();

    expect(all.filter((name) => !used.has(name)).sort()).toEqual([]);
  });

  it('removes the packages only the removed components used, plus uuid and @types/uuid', () => {
    const gone = [
      'embla-carousel-react',
      'input-otp',
      'vaul',
      'uuid',
      '@types/uuid',
    ];

    expect(gone.filter((name) => name in declared)).toEqual([]);
  });

  it('imports uuid from no source file (identifiers use crypto.randomUUID)', () => {
    const offenders = sourceFiles(root)
      .filter((file) => rel(file) !== 'tests/unit/repository-hygiene.test.ts')
      .filter((file) => /from\s+['"]uuid['"]/.test(readFileSync(file, 'utf8')))
      .map(rel);

    expect(offenders).toEqual([]);
  });

  it('keeps exactly one theme switcher at components/theme-toggle.tsx', () => {
    const toggles = sourceFiles(join(root, 'components'))
      .map(rel)
      .filter((file) => /theme-toggle|teheme-toggle/.test(file))
      .sort();

    expect(toggles).toEqual(['components/theme-toggle.tsx']);
    expect(existsSync(join(root, 'components/teheme-toggle.tsx'))).toBe(false);
    expect(existsSync(join(root, 'components/layout/teheme-toggle.tsx'))).toBe(
      false
    );
  });

  it('points the landing page and the app header at the one theme switcher', () => {
    for (const file of [
      'components/landing/landing-nav.tsx',
      'components/layout/site-header.tsx',
    ]) {
      const text = readFileSync(join(root, file), 'utf8');

      expect(text, file).toMatch(/@\/components\/theme-toggle['"]/);
      expect(text, file).not.toMatch(/teheme-toggle/);
    }
  });
  // editor-ux T37 (AC-16, review T-h b/e)
  it('no component under components/invoice-editor/ renders its own dialog', () => {
    const files = sourceFiles(join(root, 'components/invoice-editor'));
    expect(files.length).toBeGreaterThan(0);

    const offenders = files
      .filter((file) => rendersOwnDialog(readFileSync(file, 'utf8')))
      .map(rel);

    expect(offenders).toEqual([]);
  });

  it('the own-dialog scanner flags a dialog import (not vacuous)', () => {
    expect(
      rendersOwnDialog(`import { Dialog } from '@/components/ui/dialog';`)
    ).toBe(true);
    expect(
      rendersOwnDialog(`import { AlertDialog } from "@/components/ui/alert-dialog";`)
    ).toBe(true);
    expect(
      rendersOwnDialog(
        `import { ConfirmationModal } from '@/components/modals/confirmation-modal';\nexport const X = () => <ConfirmationModal />;`
      )
    ).toBe(true);
    expect(rendersOwnDialog(`import { Button } from '@/components/ui/button';`)).toBe(false);
    // Negative controls: each further way of rendering a dialog is flagged too.
    expect(rendersOwnDialog(`import * as D from '@radix-ui/react-dialog';`)).toBe(true);
    expect(rendersOwnDialog(`import { Root } from "@radix-ui/react-alert-dialog";`)).toBe(true);
    expect(rendersOwnDialog(`import { Drawer } from 'vaul';`)).toBe(true);
    expect(rendersOwnDialog(`export const X = () => <dialog open>hi</dialog>;`)).toBe(true);
    expect(rendersOwnDialog(`export const X = () => <dialog>hi</dialog>;`)).toBe(true);
    // layout sheet is allowed (ADR-0004)
    expect(rendersOwnDialog(`import { Sheet } from '@/components/ui/sheet';`)).toBe(false);
  });

  it('architecture-map.md lists no shared primitive whose file is gone from components/ui/', () => {
    const map = readFileSync(join(root, 'docs/architecture-map.md'), 'utf8');
    const line = map.split('\n').find((l) => l.startsWith('- **Shared primitives:**'));
    expect(line, 'Shared primitives line').toBeDefined();
    const list = line!.split('**Shared primitives:**')[1].split('—')[0];
    const names = list
      .split(',')
      .map((n) => n.replace(/\(.*?\)/g, '').trim())
      .filter((n) => /^[A-Z][A-Za-z]+$/.test(n));
    expect(names.length).toBeGreaterThan(5);

    const kebab = (n: string) => n.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const missing = names.filter(
      (n) => !existsSync(join(root, 'components/ui', `${kebab(n)}.tsx`))
    );

    expect(missing).toEqual([]);
  });
});
