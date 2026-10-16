// landing-update T01 (AC-05, AC-06, AC-07; sad §8 "Claim truthfulness"): every string in landingContent is
// walked and the AI claims are pinned, so a copy edit that becomes untrue fails here.
import { describe, expect, it } from 'vitest';
import { landingContent } from '@/constants/public-pages-content';

type Entry = { path: string; text: string };

function walk(value: unknown, path: string, out: Entry[] = []): Entry[] {
  if (typeof value === 'string') out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k, out);
  return out;
}

const content = landingContent as unknown as Record<string, unknown>;
const all = walk(content, '');
const aiEntries = walk(content.aiSection, 'aiSection');
const aiText = aiEntries.map((e) => e.text).join('\n');
const allText = all.map((e) => e.text).join('\n');

describe('landingContent new copy exists (AC-06, AC-07)', () => {
  it('has the AI section, demo sample, hero fields and metadata', () => {
    const c = content as Record<string, Record<string, unknown> | undefined>;
    expect(c.aiSection, 'aiSection').toBeDefined();
    expect(c.demo, 'demo').toBeDefined();
    expect(c.metadata, 'metadata').toBeDefined();
    expect(c.hero?.headline, 'hero.headline').toBeDefined();
    expect(c.hero?.supportingLine, 'hero.supportingLine').toBeDefined();
    expect(c.hero?.ctaButton, 'hero.ctaButton').toBeDefined();
    for (const k of ['badge', 'h2', 'does', 'never', 'ownTools', 'smallPrint', 'privacyLink', 'ctaButton'])
      expect(c.aiSection?.[k], `aiSection.${k}`).toBeDefined();
    for (const k of ['sentence', 'customer', 'lines', 'total', 'currency', 'exampleLabel', 'createLabel', 'replayLabel', 'srSummary'])
      expect(c.demo?.[k], `demo.${k}`).toBeDefined();
  });

  it('demo ends on the default draft sample (AC-05)', () => {
    const demo = content.demo as Record<string, unknown> | undefined;
    expect(demo?.sentence).toBe('Invoice Acme for 20 hours of design at $50');
    expect(demo?.customer).toBe('Acme Corp');
    expect(demo?.total).toBe('$1,000.00');
    expect(demo?.currency).toBe('USD');
    expect(demo?.lines).toEqual([
      expect.objectContaining({ description: 'Design', quantityLabel: '20 h × $50.00', amount: '$1,000.00' }),
    ]);
  });

  it('metadata carries the one-sentence draft message', () => {
    const md = walk(content.metadata, 'metadata')
      .map((e) => e.text)
      .join('\n');
    expect(md).toMatch(/invoice draft from one sentence with AI/i);
  });
});

describe('AI section claims (AC-06)', () => {
  it('states the daily message limit and no-training', () => {
    expect(aiText).toMatch(/daily (message )?limit/i);
    expect(aiText).toMatch(/not used to train AI models/i);
  });
  it('says the AI asks instead of guessing and never issues or sends', () => {
    expect(aiText).toMatch(/asks[^.]*instead of guessing/i);
    expect(aiText).toMatch(/never issues[^.]*sends|never (issues|sends)/i);
  });
  it('answers questions about own invoices and links to privacy only', () => {
    expect(aiText).toMatch(/who owes you|overdue/i);
    const link = (content.aiSection as Record<string, unknown> | undefined)?.privacyLink as
      | { href?: string }
      | string
      | undefined;
    const href = typeof link === 'string' ? link : link?.href;
    expect(href).toMatch(/privacy/);
  });
});

describe('own AI tools claims (AC-07)', () => {
  it('names exactly Claude Desktop, Claude Code and Cursor', () => {
    expect(aiText).toMatch(/Claude Desktop/);
    expect(aiText).toMatch(/Claude Code/);
    expect(aiText).toMatch(/Cursor/);
  });
  it('says drafts from such a tool need a permission chosen when connecting', () => {
    expect(aiText).toMatch(/permission[^.]*(you )?choose[^.]*connecting/i);
  });
  it('never says bare "Claude", ChatGPT, or "any AI tool" anywhere', () => {
    expect(allText).not.toMatch(/Claude(?! (Desktop|Code))/);
    expect(allText).not.toMatch(/ChatGPT|OpenAI/i);
    expect(allText).not.toMatch(/any AI tool/i);
  });
  it('uses MCP at most once overall and never in a heading field', () => {
    expect(allText.match(/\bMCP\b/g)?.length ?? 0).toBeLessThanOrEqual(1);
    const headingKey = /(^|\.)(h1|h2|h3|title|badge|headline|heading|label)(\.|\[|$)/i;
    for (const e of all.filter((x) => headingKey.test(x.path) || /aiSection\.(does|never|ownTools)\.(title|heading)/.test(x.path)))
      expect(e.text, e.path).not.toMatch(/\bMCP\b/);
    expect((content.aiSection as Record<string, unknown> | undefined)?.smallPrint).toMatch(/\bMCP\b/);
  });
});

describe('truth guard over all of landingContent (AC-05)', () => {
  it('"unlimited" only for invoices and clients', () => {
    for (const e of all.filter((x) => /unlimited/i.test(x.text)))
      expect(e.text, e.path).toMatch(/unlimited invoices( (&|and) clients)?/i);
  });
  it('no text promises unlimited use of the AI', () => {
    expect(allText).not.toMatch(/unlimited[^.\n]*(AI|assistant|chat|messages|usage)/i);
  });
  it('no link to developer documentation or connect-ai setup', () => {
    for (const e of all.filter((x) => /(^|\.)href$/.test(x.path) || /^https?:|^\//.test(x.text)))
      expect(e.text, e.path).not.toMatch(/\/docs|docs\.|developer|connect-ai|\/mcp/i);
  });
  it('nothing says the AI issues, sends, emails, edits or creates a Customer', () => {
    const bad =
      /\bAI\b[^.\n]*\b(issues|sends|emails|edits|deletes|creates (a |the )?customers?)\b/i;
    for (const e of all.filter((x) => !/\bnever\b/i.test(x.text)))
      expect(e.text, e.path).not.toMatch(bad);
    expect(aiText).not.toMatch(/\bAI\b[^.\n]*\bcreates (a |the )?customers?\b/i);
  });
});
