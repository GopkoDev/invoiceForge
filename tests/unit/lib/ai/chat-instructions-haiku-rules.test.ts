// ai-chat-v2 T116 + T121 (AC-05b, AC-14, AC-16, AC-45; review W1, W2, N5): the chat instructions' Haiku rules.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/prisma', () => ({ prisma: {} }));

const text = async () => (await import('@/lib/ai/instructions/chat')).CHAT_INSTRUCTIONS as string;

describe('CHAT_INSTRUCTIONS Customer rules (T116, T121)', () => {
  it('passes the Customer in `customer` as written, even when a search found several or none', async () => {
    const t = await text();
    expect(t).toMatch(/`customer`[^.]*\bas (the Freelancer )?wrote/i);
    expect(t).toMatch(/even when[^.]*(several|many|no)[^.]*(Customers?|match)/i);
  });

  it('never passes customerId together with `customer`, except for a form answer\'s customerId', async () => {
    const t = await text();
    expect(t).toMatch(/Never pass customerId together with `customer`/);
    expect(t).toMatch(/Except for a form answer's customerId/i);
  });

  it('when the Freelancer named no Customer, leave it out (no guessing); the old "never leave out" rule is gone', async () => {
    const t = await text();
    expect(t).toMatch(/When they named none, leave it out/i);
    expect(t).not.toMatch(/Never leave the Customer out\./);
  });

  it('a sender-profile name given as the Customer is still passed as `customer`, never as senderProfile', async () => {
    expect(await text()).toMatch(/never as senderProfile/i);
  });

  it('a sender profile named without a Customer: choose it in the form, else one sentence ending with a question mark', async () => {
    expect(await text()).toMatch(
      /when a form is shown, ask them to choose the Customer in it; otherwise ask in one sentence that ends with a question mark/i
    );
  });
});

describe('CHAT_INSTRUCTIONS price and count rules (T121)', () => {
  it('never passes a price the model read from a tool (catalogue or custom price)', async () => {
    expect(await text()).toMatch(/Never pass a price[^.]*you read from a tool/i);
  });

  it('with many matches the reply says that number, not "several" or "multiple"', async () => {
    expect(await text()).toMatch(/say that number/i);
  });

  // T124 (review W-4, N-4)
  it('a Customer named earlier in the Conversation, including the one on the card being changed, is passed too', async () => {
    const t = await text();
    expect(t).toMatch(/named a Customer in this Conversation/i);
    expect(t).toMatch(/card being changed/i);
  });

  it('the price promise is conditional: fills from the catalogue or custom price, or asks', async () => {
    const t = await text();
    expect(t).toMatch(/fills the price from the catalogue or the Customer's custom price, or asks/i);
    expect(t).not.toMatch(/propose_draft fills the catalogue price or the Customer's custom price\./);
  });
});

// ai-chat-v2 T126 (AC-14, AC-47, AC-45): counts in digits; a generic-looking name is searched, then passed as written.
describe('CHAT_INSTRUCTIONS counts and generic-looking names (T126)', () => {
  it('writes every count as digits', async () => {
    expect(await text()).toMatch(/Write every count as digits/i);
  });

  it('a generic-looking phrase such as "my new customer" is searched with list_customers or list_products first', async () => {
    expect(await text()).toMatch(/looks generic[^.]*my new customer[^.]*search/i);
  });

  it('a searched generic-looking name is passed as written', async () => {
    expect(await text()).toMatch(/pass it as written/i);
  });
});

// ai-chat-v2 T130 (AC-48): a link to an invoice or draft named earlier is searched, not refused or doubted.
describe('CHAT_INSTRUCTIONS link to a named invoice (T130)', () => {
  it('searches with search_invoices before linking an invoice or draft named or mentioned earlier', async () => {
    expect(await text()).toMatch(
      /asks for a link to an invoice or draft named or mentioned earlier[^.]*search[^.]*search_invoices/i
    );
  });
});
