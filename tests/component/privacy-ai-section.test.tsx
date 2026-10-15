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
      /whether each message was typed, pressed, sent from a form or sent from the dashboard/i
    );
    expect(text).toMatch(/where each Conversation was started/i);
  });

  it('1b. names Question forms with their options and the answers sent including typed text, and where each message came from (T61, AC-35)', () => {
    const text = aiSection();
    expect(text).toMatch(
      /Question forms with their options and the answers you sent,? including (any )?(text|answers) you typed/i
    );
    // Offered choices and the ones chosen stay named alongside the forms.
    expect(text).toMatch(/Offered choices|options the chat offered as buttons/i);
    expect(text).toMatch(/the one you chose|the ones you chose/i);
    // Message origin names all four ways, including a form.
    expect(text).toMatch(/typed/i);
    expect(text).toMatch(/pressed/i);
    expect(text).toMatch(/sent from a form/i);
    expect(text).toMatch(/sent from the dashboard/i);
    expect(text).toMatch(/where each (message|Conversation)/i);
  });

  it('1c. says forms and their answers are in the data export and removed with the account (T61, AC-34)', () => {
    const text = aiSection();
    expect(text).toMatch(/Question forms/i);
    expect(text).toMatch(/included in your data export/i);
    expect(text).toMatch(/removed when you delete your account/i);
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
    expect(text).toMatch(/Anthropic Claude model through the Vercel AI Gateway/);
    expect(text).not.toMatch(/Google Gemini/i);
    expect(text).toMatch(/message text/i);
    expect(text).toMatch(/no other (company|processor)/i);
    const who = text.slice(text.search(/Who processes your message text/i));
    expect(who).toMatch(/Anthropic/);
    expect(who).toMatch(/Vercel/);
  });

  it('states zero data retention by the model provider and processing in the USA (T109)', () => {
    const text = aiSection();
    expect(text).toMatch(/zero data retention|keeps no copy/i);
    expect(text).toMatch(/USA/);
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
