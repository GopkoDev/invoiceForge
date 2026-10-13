// T25 (ai-chat-v2; AC-28, screens.md §SCR-08): the single main "AI" item is replaced by an "AI" group between the
// main section and "Management", holding "AI chat" (/ai) and "Connect your AI" (/settings/assistants, plug icon).
import { describe, expect, it } from 'vitest';

import { navigationIcons } from '@/config/navigation-icons.config';
import { navigationMenuConfig } from '@/config/navigation-menu.config';

const sections = navigationMenuConfig.sections!;

describe('navigation "AI" group (SCR-08)', () => {
  it('the main section no longer holds an "AI" item', () => {
    const main = sections.find((s) => s.type === 'main')!;
    expect(main.items!.map((i) => i.title)).toEqual(['Dashboard', 'Invoices']);
  });

  it('an "AI" group sits between the main section and "Management"', () => {
    const labels = sections.map((s) => (s.type === 'group' ? s.label : s.type));
    expect(labels.indexOf('AI')).toBe(labels.indexOf('main') + 1);
    expect(labels.indexOf('Management')).toBe(labels.indexOf('AI') + 1);
    expect(sections.find((s) => s.label === 'AI')!.type).toBe('group');
  });

  it('holds "AI chat" -> /ai (icon ai) and "Connect your AI" -> /settings/assistants (a plug icon)', () => {
    const group = sections.find((s) => s.label === 'AI')!;
    expect(group.items!.map((i) => [i.title, i.url, i.icon])).toEqual([
      ['AI chat', '/ai', 'ai'],
      ['Connect your AI', '/settings/assistants', 'plug'],
    ]);
    expect(navigationIcons.plug.displayName ?? navigationIcons.plug.name).toMatch(/Plug/);
  });
});
