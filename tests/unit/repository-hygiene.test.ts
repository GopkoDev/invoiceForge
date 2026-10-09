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
});
