import { readdirSync, readFileSync } from 'node:fs';
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

describe('repository hygiene (spec §6, F4–F6)', () => {
  it('declares the sdd marketplace in the shared Claude settings (F4)', () => {
    const settings = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'));

    expect(settings.extraKnownMarketplaces?.sdd?.source).toEqual({
      source: 'github',
      repo: 'genkovich/sdd',
    });
    expect(settings.enabledPlugins?.['sdd@sdd']).toBe(true);
  });

  it('git-ignores personal Claude settings (F5)', () => {
    const ignoreRules = readFileSync(join(root, '.gitignore'), 'utf8').split('\n');

    expect(ignoreRules).toContain('.claude/settings.local.json');
  });

  it('has no empty route folders under app/ (F6)', () => {
    expect(emptyDirectories(join(root, 'app')).map((dir) => dir.slice(root.length + 1))).toEqual(
      []
    );
  });
});
