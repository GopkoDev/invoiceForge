// Review R16-8 / T43 (ADR-0010): the reusable elements in components/ai-elements never import from the feature folder
// components/ai, so the layering runs one way (domain pieces use elements, never the reverse).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(process.cwd(), 'components/ai-elements');

describe('components/ai-elements layering (ADR-0010)', () => {
  it('no element imports from @/components/ai/', () => {
    const offenders = readdirSync(DIR)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) =>
        /from ['"]@\/components\/ai\//.test(readFileSync(join(DIR, f), 'utf8'))
      );
    expect(offenders).toEqual([]);
  });
});
