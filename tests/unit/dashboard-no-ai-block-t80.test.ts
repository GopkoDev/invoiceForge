// T80 (ai-chat-v2; owner decision 2026-10-14): the dashboard renders no AI block (SCR-09 removed;
// AC-29, AC-31, AC-32 and the latest-Conversations part of AC-30). The Connect-AI banner stays.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('dashboard has no AI block (T80)', () => {
  it('the dashboard page does not compose the AI block or its skeleton', () => {
    const page = read('app/(protected)/dashboard/page.tsx');
    expect(page).not.toMatch(/AiBlockSection/);
    expect(page).not.toMatch(/DashboardAiBlockSkeleton/);
    expect(page).toMatch(/getConnectAiEntryState/);
  });

  it('the dashboard sections module has no AiBlockSection', () => {
    expect(read('app/(protected)/dashboard/_sections.tsx')).not.toMatch(/AiBlockSection/);
  });

  it('the dashboard barrel no longer exports the AI-block skeleton', () => {
    expect(read('components/dashboard/index.ts')).not.toMatch(/DashboardAiBlockSkeleton/);
  });

  it('the AI block component and its skeleton files are gone', () => {
    expect(existsSync(join(root, 'components/dashboard/ai-block.tsx'))).toBe(false);
    expect(existsSync(join(root, 'components/dashboard/skeletons/dashboard-ai-block-skeleton.tsx'))).toBe(false);
  });

  it('getDashboardAiBlock is removed; the Connect-AI entry state stays', () => {
    const actions = read('lib/actions/dashboard-actions.ts');
    expect(actions).not.toMatch(/getDashboardAiBlock/);
    expect(actions).toMatch(/getConnectAiEntryState/);
  });
});
