// @vitest-environment jsdom
// ai-chat-v2 T28 (spec.md §5 AC-35; screens.md §SCR-13): the privacy page's AI section states what the chat
// stores, how long, who processes message text, and what the reads share with an AI client connected through
// a Personal key — never a full account number. Wording is reviewed by the owner before ship.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/privacy',
}));

import { PrivacyPolicyContent } from '@/app/(public)/privacy/privacy-content';

function aiSection(): string {
  render(<PrivacyPolicyContent />);
  const heading = screen.getByRole('heading', {
    level: 2,
    name: /AI assistant/i,
  });
  return heading.parentElement?.textContent ?? '';
}

describe('privacy page — AI section for the chat (ai-chat-v2 T28, AC-35)', () => {
  it('1. says what the chat stores', () => {
    const text = aiSection();
    expect(text).toMatch(/Conversations with their messages and draft cards/i);
    expect(text).toMatch(
      /options the chat offered as buttons and the one you chose/i
    );
    expect(text).toMatch(/prompts? (you )?sen[dt] from the dashboard/i);
    expect(text).toMatch(
      /whether each message was typed, pressed or sent from the dashboard/i
    );
    expect(text).toMatch(/where each Conversation was started/i);
  });

  it('2. says how long it is kept: 90 days after the last message, or until deleted', () => {
    const text = aiSection();
    expect(text).toMatch(/90 days after its last message/i);
    expect(text).toMatch(
      /until you delete (it|the Conversation) or your account/i
    );
  });

  it('3. names the model provider through its gateway as the processor of message text, with no other processor', () => {
    const text = aiSection();
    expect(text).toMatch(/Google Gemini model through the Vercel AI Gateway/);
    expect(text).toMatch(/message text/i);
    expect(text).toMatch(/no other (company|processor)/i);
  });

  it('4. says what the reads share with an AI client connected through a Personal key — never a full account number', () => {
    const text = aiSection();
    expect(text).toMatch(/Personal key/);
    expect(text).toMatch(/sender profile names and defaults/i);
    expect(text).toMatch(/bank name, the last four digits and the currency/i);
    expect(text).toMatch(/never a full account number/i);
    expect(text).toMatch(/products with their prices and Custom prices/i);
    expect(text).toMatch(/Customers found by name/i);
  });
});
