// @vitest-environment jsdom
// T05 (ai-assistant; spec §6.1, §8; ADR-0003): the public Privacy page has an "AI assistant" section that
// names the Vercel AI Gateway and Google as processors of chat text, states the free-tier terms,
// the 90-day Conversation retention and the metadata-only traces.
// See docs/features/ai-assistant/tasks/t05-privacy-page-model-provider.md
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/privacy',
}));

import { PrivacyPolicyContent } from '@/app/(public)/privacy/privacy-content';

function aiSection(): string {
  render(<PrivacyPolicyContent />);
  const heading = screen.getByRole('heading', { level: 2, name: /AI assistant/i });
  return heading.parentElement?.textContent ?? '';
}

describe('privacy page — AI assistant section (T05)', () => {
  it('renders a section headed "AI assistant"', () => {
    aiSection();
    expect(screen.getByRole('heading', { level: 2, name: /AI assistant/i })).toBeInTheDocument();
  });

  it('names the Vercel AI Gateway and Google as processors of chat text', () => {
    const text = aiSection();
    expect(text).toMatch(/Vercel AI Gateway/);
    expect(text).toMatch(/Google/);
    expect(text).toMatch(/message text/i);
  });

  it('states the free-tier terms: Google may use content to improve its products and reviewers may read it', () => {
    const text = aiSection();
    expect(text).toMatch(/free tier/i);
    expect(text).toMatch(/improve (its|Google's|Google’s) products/i);
    expect(text).toMatch(/reviewers?/i);
    expect(text).toMatch(/read/i);
  });

  it('states the 90-day Conversation retention, deletion, export and account removal', () => {
    const text = aiSection();
    expect(text).toMatch(/90 days/i);
    expect(text).toMatch(/last message/i);
    expect(text).toMatch(/delete/i);
    expect(text).toMatch(/export/i);
    expect(text).toMatch(/account/i);
  });

  it('states that debugging traces hold metadata only, no message text', () => {
    const text = aiSection();
    expect(text).toMatch(/metadata only|only metadata/i);
    expect(text).toMatch(/no message text/i);
  });
});
