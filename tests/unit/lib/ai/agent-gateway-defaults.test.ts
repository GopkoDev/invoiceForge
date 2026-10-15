// ai-chat-v2 T101 (SEC-I-04): the app chatAgent carries the gateway pin in its own defaults, so a call site
// that forgets the option cannot send message text to other providers or to ones that train on prompts.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/prisma', () => ({ prisma: {} })); // the agent's tool chain loads Prisma; nothing here queries it

import { chatAgent } from '@/lib/ai/agent';
import { GATEWAY_PROVIDER_OPTIONS } from '@/lib/ai/model';

describe('chatAgent default options (T101)', () => {
  it('defaults providerOptions to the shared gateway pin', async () => {
    const defaults = await chatAgent.getDefaultOptions();
    expect(defaults.providerOptions).toEqual(GATEWAY_PROVIDER_OPTIONS);
    expect(defaults.providerOptions).toEqual({ gateway: { only: ['anthropic'], disallowPromptTraining: true } });
    // T113: zeroDataRetention was dropped; the Vercel Hobby plan refuses it and every turn fails.
    expect(defaults.providerOptions?.gateway).not.toHaveProperty('zeroDataRetention');
  });
});
