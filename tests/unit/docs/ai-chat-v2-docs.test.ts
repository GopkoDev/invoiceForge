import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const DESIGN = join(root, 'docs/design-system.md');
const FLOWS = join(root, 'docs/features/ai-chat-v2/ux-flows.md');
const design = readFileSync(DESIGN, 'utf8');
const flows = readFileSync(FLOWS, 'utf8');

/** Inventory rows are table lines whose first cell starts with the component name. */
function row(name: string): string | undefined {
  return design.split('\n').find((l) => l.startsWith('|') && l.split('|')[1]?.includes(`\`${name}\``));
}

function pathsIn(text: string): string[] {
  return [...text.matchAll(/`((?:components|lib)\/[\w./-]+\.(?:tsx?|ts))`/g)].map((m) => m[1]);
}

describe('design-system inventory (ai-chat-v2 T69)', () => {
  it.each([
    ['QuestionForm', 'components/ai/question-form.tsx'],
    ['ConversationListProvider', 'components/ai/conversation-list-context.tsx'],
  ])('registers %s with its real path', (name, path) => {
    const r = row(name);
    expect(r, `${name} row`).toBeDefined();
    expect(r).toContain(path);
    expect(existsSync(join(root, path))).toBe(true);
    for (const p of pathsIn(r!)) expect(existsSync(join(root, p)), p).toBe(true);
  });

  it('describes MessageResponse as Markdown with the in-app link allowlist', () => {
    const r = row('Message` / `MessageContent') ?? design.split('\n').find((l) => l.includes('`MessageResponse(') || l.includes('MessageResponse({'));
    expect(r).toBeDefined();
    expect(r).toMatch(/react-markdown/);
    expect(r).toMatch(/remark-gfm/);
    expect(r).toContain('lib/ai/in-app-links.ts');
    expect(existsSync(join(root, 'lib/ai/in-app-links.ts'))).toBe(true);
    expect(r).not.toMatch(/never Markdown/i);
    expect(r).not.toMatch(/no streamdown\/Markdown/i);
  });

  it('does not list OfferedChoices as a live component', () => {
    const r = row('OfferedChoices');
    if (r) expect(r).toMatch(/removed/i);
    expect(existsSync(join(root, 'components/ai/offered-choices.tsx'))).toBe(false);
  });
});

describe('ux-flows (ai-chat-v2 T69)', () => {
  it('describes the Question form flow', () => {
    expect(flows).toMatch(/question form/i);
    expect(flows).toMatch(/skip/i);
    expect(flows).toMatch(/typed/i);
    expect(flows).toMatch(/\bSend\b/);
    expect(flows).toMatch(/clos(es|ed)/i);
  });

  it('describes Markdown replies with in-app links', () => {
    expect(flows).toMatch(/markdown/i);
    expect(flows).toMatch(/in-app link/i);
  });

  it('describes the persistent Conversation list on switch', () => {
    expect(flows).toMatch(/persistent|stays mounted|keeps? (the|its) list|not loaded again/i);
    expect(flows).toMatch(/scroll position|search text/i);
  });
});

describe('relative markdown links resolve', () => {
  it.each([DESIGN, FLOWS])('%s', (file) => {
    const text = readFileSync(file, 'utf8');
    const broken = [...text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)]
      .map((m) => m[1])
      .filter((l) => !/^[a-z]+:/i.test(l))
      .filter((l) => !existsSync(resolve(dirname(file), l)));
    expect(broken).toEqual([]);
  });
});
