// ai-chat-v2 T116 (AC-05b, AC-14, AC-45): the chat instructions tell the model to pass the Customer as written.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/prisma', () => ({ prisma: {} }));

const text = async () => (await import('@/lib/ai/instructions/chat')).CHAT_INSTRUCTIONS as string;

describe('CHAT_INSTRUCTIONS Customer rules (T116)', () => {
  it('passes the Customer in `customer` as written, even when a search found several or none', async () => {
    const t = await text();
    expect(t).toMatch(/`customer`[^.]*\bas (the Freelancer )?wrote/i);
    expect(t).toMatch(/even when[^.]*(several|many|no)[^.]*(Customers?|match)/i);
  });

  it('never passes customerId together with `customer`', async () => {
    expect(await text()).toMatch(/customerId[^.]*never[^.]*(together with|both)|never[^.]*both[^.]*customerId|never (pass )?[^.]*together with `customer`/i);
  });

  it('a sender-profile name given as the Customer is still passed as `customer`, never as senderProfile', async () => {
    expect(await text()).toMatch(/never as senderProfile/i);
  });
});
