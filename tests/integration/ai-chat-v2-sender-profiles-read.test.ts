// ai-chat-v2 T05 (AC-01, AC-06, AC-07; openapi x-mcp-tools list_sender_profiles + SenderProfilesAnswer): the
// sender-profile read question, registered once and answered the same through a Personal key without Draft
// permission and through the chat. Only the acting Freelancer's profiles; account numbers as the last four only.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isContainerRuntimeAvailable } from './../support/db/docker-availability';
import { truncateAllTables } from './../support/db/truncate';
import { createFreelancer } from './../support/factories/user';
import { createSenderProfile } from './../support/factories/sender-profile';
import { createBankAccount } from './../support/factories/bank-account';
import { createPersonalKey } from './../support/factories/personal-key';
import { startMcpHarness, type McpHarness } from './../support/mcp-e2e';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const TZ = 'Europe/Kyiv';
const STUDIO_NUMBER = '2600 1234 5678 4821';
const FOP_NUMBER = 'UA21 3223 1300 0002 6007 2335 0915';
const GLOBEX_NUMBER = '9999 8888 7777 6666';

describe.runIf(containerRuntimeAvailable)('list_sender_profiles (ai-chat-v2 T05)', () => {
  let h: McpHarness;
  let userId: string;
  let otherUserId: string;
  let fullKey: string;
  let ids: { studio: string; studioUsd: string; fop: string; fopUah: string };

  beforeAll(async () => {
    h = await startMcpHarness();
  }, 60_000);
  afterAll(async () => {
    await h?.stop();
  });

  beforeEach(async () => {
    const prisma = h.factoryPrisma;
    await truncateAllTables(prisma);
    const user = await createFreelancer(prisma, { timeZone: TZ });
    userId = user.id;
    // AC-01: "Studio" (default) with a default USD account ending 4821; "Consulting FOP" with a UAH account ending 0915.
    const studio = await createSenderProfile(prisma, userId, { name: 'Studio', isDefault: true, taxId: 'TAX-STUDIO-1' });
    const studioUsd = await createBankAccount(prisma, studio.id, {
      bankName: 'Test Bank',
      currency: 'USD',
      accountNumber: STUDIO_NUMBER,
      iban: 'GB82WEST12345698765432',
      swift: 'TESTGB2L',
      isDefault: true,
    });
    const fop = await createSenderProfile(prisma, userId, { name: 'Consulting FOP', isDefault: false });
    const fopUah = await createBankAccount(prisma, fop.id, { bankName: 'Test Bank UA', currency: 'UAH', accountNumber: FOP_NUMBER });
    ids = { studio: studio.id, studioUsd: studioUsd.id, fop: fop.id, fopUah: fopUah.id };

    // AC-07: only the second Freelancer has "Globex Ltd".
    const other = await createFreelancer(prisma, { timeZone: TZ });
    otherUserId = other.id;
    const globex = await createSenderProfile(prisma, otherUserId, { name: 'Globex Ltd', isDefault: true });
    await createBankAccount(prisma, globex.id, { bankName: 'Globex Bank', currency: 'EUR', accountNumber: GLOBEX_NUMBER });

    // AC-06: a key without Draft permission.
    ({ fullKey } = await createPersonalKey(prisma, userId));
  });

  async function chatTools() {
    const { createTurnContext } = await import('@/lib/ai/turn-context');
    const { createReadTools } = await import('@/lib/ai/tools/read-tools');
    const actor = await h.actor(userId, TZ);
    return createReadTools(createTurnContext({ actor, today: '2026-10-13' })) as Record<string, { execute?: (i: any, c: any) => Promise<any> }>;
  }

  const expectedRows = () => [
    {
      senderProfileId: ids.studio,
      name: { freelancerText: 'Studio' },
      isDefault: true,
      bankAccounts: [
        { bankAccountId: ids.studioUsd, bankName: { freelancerText: 'Test Bank' }, lastFour: '4821', currency: 'USD', isDefault: true },
      ],
    },
    {
      senderProfileId: ids.fop,
      name: { freelancerText: 'Consulting FOP' },
      isDefault: false,
      bankAccounts: [
        { bankAccountId: ids.fopUah, bankName: { freelancerText: 'Test Bank UA' }, lastFour: '0915', currency: 'UAH', isDefault: true },
      ],
    },
  ];

  it('AC-01: the service lists both profiles, default first, each account by bank name, last four, currency and default', async () => {
    const { listSenderProfilesForAssistant } = await import('@/lib/services/sender-profiles/sender-profiles');
    const actor = await h.actor(userId, TZ);
    const res = await listSenderProfilesForAssistant(actor, {});
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.rows.map((r) => [r.name, r.isDefault, r.bankAccounts.map((a) => [a.bankName, a.lastFour, a.currency, a.isDefault])])).toEqual([
      ['Studio', true, [['Test Bank', '4821', 'USD', true]]],
      ['Consulting FOP', false, [['Test Bank UA', '0915', 'UAH', true]]],
    ]);
    expect(res.data.pageInfo).toMatchObject({ page: 1, pageSize: 20, total: 2, hasMore: false });
  });

  it('AC-06 + AC-01: a key without Draft permission gets the answer through MCP, with ids and no full number', async () => {
    const viaMcp = await h.call(fullKey, 'list_sender_profiles', {});
    expect(viaMcp.isError).toBe(false);
    expect((viaMcp.structuredContent as any).rows).toEqual(expectedRows());
    const text = JSON.stringify(viaMcp);
    for (const secret of [STUDIO_NUMBER, FOP_NUMBER, STUDIO_NUMBER.replace(/\s/g, ''), 'GB82WEST12345698765432', 'TESTGB2L', 'TAX-STUDIO-1']) {
      expect(text).not.toContain(secret);
    }
  });

  it('the chat adapter answers exactly what MCP answers (one registry)', async () => {
    const tools = await chatTools();
    expect(Object.keys(tools)).toContain('list_sender_profiles');
    const viaChat = await tools.list_sender_profiles.execute!({}, {});
    const viaMcp = await h.call(fullKey, 'list_sender_profiles', {});
    const { links, ...answer } = viaChat;
    expect(links).toEqual([]);
    expect(answer).toEqual(viaMcp.structuredContent);
  });

  it('AC-07: another Freelancer\'s profiles never appear, and there is no count hint', async () => {
    const tools = await chatTools();
    const viaChat = await tools.list_sender_profiles.execute!({}, {});
    const text = JSON.stringify(viaChat);
    expect(text).not.toContain('Globex');
    expect(text).not.toContain('6666');
    expect(viaChat.pageInfo.total).toBe(2);
  });

  it('a Freelancer with no sender profile gets an empty list, total 0', async () => {
    const lonely = await createFreelancer(h.factoryPrisma, { timeZone: TZ });
    const { listSenderProfilesForAssistant } = await import('@/lib/services/sender-profiles/sender-profiles');
    const res = await listSenderProfilesForAssistant(await h.actor(lonely.id, TZ), {});
    expect(res).toMatchObject({ success: true, data: { rows: [], pageInfo: { total: 0 } } });
  });

  it('pageSize above 20 is capped at 20 and reported', async () => {
    const viaMcp = await h.call(fullKey, 'list_sender_profiles', { pageSize: 50 });
    expect((viaMcp.structuredContent as any).pageInfo).toMatchObject({ pageSize: 20, pageSizeCapped: true });
  });

  it('is listed by tools/list as read-only', async () => {
    await h.factoryPrisma.limitEvent.deleteMany();
    const res = await h.route.POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'x-real-ip': '203.0.113.9',
          authorization: `Bearer ${fullKey}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      })
    );
    const { tools } = (await res.json()).result;
    const tool = tools.find((t: any) => t.name === 'list_sender_profiles');
    expect(tool).toBeDefined();
    expect(tool.annotations).toMatchObject({ readOnlyHint: true });
  });
});

describe.runIf(!containerRuntimeAvailable)('list_sender_profiles (ai-chat-v2 T05)', () => {
  it.skip('skipped: no container runtime', () => {});
});
