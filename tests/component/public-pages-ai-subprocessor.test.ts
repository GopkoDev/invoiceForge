// ai-chat-v2 T90 (AC-35; review 2026-10-15 F2/F3): the privacy §5 and terms §10 sub-processor tables list
// the AI model provider, and privacy §5 no longer claims processors only handle technical infrastructure.
import { describe, expect, it } from 'vitest';
import { privacyContent, termsContent } from '@/constants/public-pages-content';

function section(content: { sections: { id: string }[] }, match: RegExp) {
  const found = content.sections.find((s) => match.test(s.id));
  expect(found, `section ${match}`).toBeDefined();
  return JSON.stringify(found);
}

describe('sub-processor tables name the AI model provider (T90)', () => {
  it('privacy §5 includes an Anthropic (via Vercel AI Gateway) row for the AI assistant', () => {
    const text = section(privacyContent as never, /processor|third|sharing|recipient/i);
    expect(text).toMatch(/Anthropic[^"]*Vercel AI Gateway/);
    expect(text).toMatch(/AI assistant/i);
  });

  it('privacy §5 no longer says processors only handle the technical infrastructure', () => {
    const text = section(privacyContent as never, /processor|third|sharing|recipient/i);
    expect(text).not.toMatch(/only handle the technical infrastructure/i);
  });

  it('terms §10 includes an Anthropic (via Vercel AI Gateway) row for the AI assistant', () => {
    const all = JSON.stringify(termsContent);
    expect(all).toMatch(/Anthropic[^"]*Vercel AI Gateway/);
    expect(all).toMatch(/AI assistant/i);
  });
});
