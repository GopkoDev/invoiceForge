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

  it('a sender profile named without a Customer: the reply ends with a question mark', async () => {
    expect(await text()).toMatch(/sender profile[^]*ends with a question mark/i);
  });
});

describe('CHAT_INSTRUCTIONS price and count rules (T121)', () => {
  it('never passes a price the model read from a tool (catalogue or custom price)', async () => {
    expect(await text()).toMatch(/Never pass a price[^.]*you read from a tool/i);
  });

  it('with many matches the reply says that number, not "several" or "multiple"', async () => {
    expect(await text()).toMatch(/say that number/i);
  });
});
