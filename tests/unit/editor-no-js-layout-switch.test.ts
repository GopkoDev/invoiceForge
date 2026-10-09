// editor-ux T17 (ADR-0004, AC-13/AC-14): the editor's phone and desktop layouts are one DOM tree
// switched by CSS; no JS media-query hook may choose what the editor renders.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.join(process.cwd(), 'components/invoice-editor');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });

describe('editor layout is switched by CSS only (T17)', () => {
  const files = sourceFiles(root);

  it('scans the editor components', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(['useIsMobile', 'use-mobile', 'matchMedia', 'useMediaQuery'])(
    'no file under components/invoice-editor uses %s',
    (needle) => {
      const offenders = files
        .filter((f) => readFileSync(f, 'utf8').includes(needle))
        .map((f) => path.relative(process.cwd(), f));
      expect(offenders).toEqual([]);
    }
  );
});
