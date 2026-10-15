// ai-chat-v2 T07 (AC-03, AC-05, AC-06, AC-07; openapi x-mcp-tools list_customers, ListCustomersInputV2 /
// CustomersAnswerV2): the Customer read question finds look-alike names (folded, ADR-0004), pages at most 20 rows with
// the total of all matches, and answers the same through a Personal key and through the chat. Also: no read answer on
// either channel holds a full bank account number, and the shared look-alike fixture set finds the same records through
// both channels for Customers and products.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isContainerRuntimeAvailable } from './../support/db/docker-availability';
import { truncateAllTables } from './../support/db/truncate';
import { createFreelancer } from './../support/factories/user';
import { createCustomer } from './../support/factories/customer';
import { createProduct } from './../support/factories/product';
import { createSenderProfile } from './../support/factories/sender-profile';
import { createBankAccount } from './../support/factories/bank-account';
import { createInvoice } from './../support/factories/invoice';
import { createPersonalKey } from './../support/factories/personal-key';
import { startMcpHarness, type McpHarness } from './../support/mcp-e2e';
import { LOOK_ALIKE_PAIRS } from './../support/fixtures/look-alike-names';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const TZ = 'Europe/Kyiv';
const NUMBERS = {
  studio: '2600 1234 5678 4821',
  fop: 'UA21 3223 1300 0002 6007 2335 0915',
  globex: '9999 8888 7777 6666',
};

describe.runIf(containerRuntimeAvailable)(
  'list_customers (ai-chat-v2 T07)',
  () => {
    let h: McpHarness;
    let userId: string;
    let otherUserId: string;
    let fullKey: string;
    let ids: { ooh: string; invoiceOnly: string; globex: string };

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
      // AC-03: saved with a Cyrillic "О" and two spaces.
      const ooh = await createCustomer(prisma, userId, { name: 'Оohn  Doe' });
      // A Customer whose current name changed, but whose old name is still copied onto an invoice (look-alike "а").
      const renamed = await createCustomer(prisma, userId, { name: 'Initech' });
      const profile = await createSenderProfile(prisma, userId, {
        name: 'Studio',
        isDefault: true,
      });
      const account = await createBankAccount(prisma, profile.id, {
        currency: 'USD',
        accountNumber: NUMBERS.studio,
        iban: 'GB82WEST12345698765432',
        swift: 'TESTGB2L',
      });
      await createInvoice(prisma, {
        senderProfile: profile,
        customer: renamed,
        bankAccount: account,
        overrides: { customerName: 'Wаyne   Enterprises' }, // Cyrillic а
      });
      ids = { ooh: ooh.id, invoiceOnly: renamed.id, globex: '' };

      // AC-07: only the second Freelancer has Customer "Globex Ltd".
      const other = await createFreelancer(prisma, { timeZone: TZ });
      otherUserId = other.id;
      const globex = await createCustomer(prisma, otherUserId, {
        name: 'Globex Ltd',
      });
      ids.globex = globex.id;

      ({ fullKey } = await createPersonalKey(prisma, userId));
    });

    async function chatTools() {
      const { createTurnContext } = await import('@/lib/ai/turn-context');
      const { createReadTools } = await import('@/lib/ai/tools/read-tools');
      const actor = await h.actor(userId, TZ);
      return createReadTools(
        createTurnContext({ actor, today: '2026-10-13' })
      ) as Record<string, { execute?: (i: any, c: any) => Promise<any> }>;
    }

    it('AC-03: "oohn doe" finds the Customer saved as "Оohn  Doe", name shown exactly as saved', async () => {
      const viaMcp = await h.call(fullKey, 'list_customers', {
        name: 'oohn doe',
      });
      expect(viaMcp.isError).toBe(false);
      const sc = viaMcp.structuredContent as any;
      expect(sc.rows.map((r: any) => r.customerId)).toEqual([ids.ooh]);
      expect(sc.rows[0].name).toEqual({ freelancerText: 'Оohn  Doe' });
      expect(sc.pageInfo).toMatchObject({ total: 1, hasMore: false });

      const { listCustomersForAssistant } =
        await import('@/lib/services/customers/customers');
      const res = await listCustomersForAssistant(await h.actor(userId, TZ), {
        name: 'oohn doe',
      });
      expect(res.success).toBe(true);
      if (res.success)
        expect(res.data.rows.map((r) => r.name)).toEqual(['Оohn  Doe']);
    });

    it('a name that only matches a name copied onto an invoice (folded) is still found, with the current name shown', async () => {
      const viaMcp = await h.call(fullKey, 'list_customers', {
        name: 'wayne enterprises',
      });
      const sc = viaMcp.structuredContent as any;
      expect(sc.rows.map((r: any) => r.customerId)).toEqual([ids.invoiceOnly]);
      expect(sc.rows[0].name).toEqual({ freelancerText: 'Initech' });
      expect(sc.pageInfo.total).toBe(1);
    });

    it('AC-05: "Globex" matches nothing for this Freelancer: no rows, total 0, no error', async () => {
      const viaMcp = await h.call(fullKey, 'list_customers', {
        name: 'Globex',
      });
      expect(viaMcp.isError).toBe(false);
      expect((viaMcp.structuredContent as any).rows).toEqual([]);
      expect((viaMcp.structuredContent as any).pageInfo.total).toBe(0);
    });

    // Review 2026-10-13 R1-B3/U5: a named read that matches nothing carries the add-a-Customer page link from code,
    // not only when the model also calls find_in_app (SCR-03 "answered — nothing matches").
    it('AC-05: in the chat, a name that matches no Customer carries the add-a-Customer link; a match carries none', async () => {
      const tools = await chatTools();
      const none = await tools.list_customers.execute!({ name: 'Globex' }, {});
      expect(none.links).toEqual([{ kind: 'page', page: 'new-customer' }]);
      const all = await tools.list_customers.execute!({}, {});
      expect(all.links).toEqual([]);
    });

    it("AC-07: another Freelancer's Customers never appear, on MCP or in the chat", async () => {
      const tools = await chatTools();
      const viaChat = await tools.list_customers.execute!(
        { name: 'Globex' },
        {}
      );
      expect(viaChat.rows).toEqual([]);
      expect(viaChat.pageInfo.total).toBe(0);
      for (const args of [{}, { name: 'globex ltd' }]) {
        expect(
          JSON.stringify(await tools.list_customers.execute!(args, {}))
        ).not.toContain('Globex');
        expect(
          JSON.stringify(await h.call(fullKey, 'list_customers', args))
        ).not.toContain('Globex');
      }
      expect(
        JSON.stringify(await h.call(fullKey, 'list_customers', {}))
      ).not.toContain(ids.globex);
    });

    it('25 matches: 20 rows and a total of 25, more to come', async () => {
      for (let i = 0; i < 25; i++)
        await createCustomer(h.factoryPrisma, userId, {
          name: `Bulk Client ${String(i).padStart(2, '0')}`,
        });
      const viaMcp = await h.call(fullKey, 'list_customers', {
        name: 'bulk client',
      });
      const sc = viaMcp.structuredContent as any;
      expect(sc.rows).toHaveLength(20);
      expect(sc.pageInfo).toMatchObject({
        page: 1,
        pageSize: 20,
        pageSizeCapped: false,
        total: 25,
        totalPages: 2,
        hasMore: true,
      });
      const page2 = await h.call(fullKey, 'list_customers', {
        name: 'bulk client',
        page: 2,
      });
      expect((page2.structuredContent as any).rows).toHaveLength(5);
    });

    it('pageSize 50 from an existing client: 20 rows, pageSizeCapped true, no error', async () => {
      for (let i = 0; i < 25; i++)
        await createCustomer(h.factoryPrisma, userId, {
          name: `Bulk Client ${String(i).padStart(2, '0')}`,
        });
      const viaMcp = await h.call(fullKey, 'list_customers', { pageSize: 50 });
      expect(viaMcp.isError).toBe(false);
      const sc = viaMcp.structuredContent as any;
      expect(sc.rows).toHaveLength(20);
      expect(sc.pageInfo).toMatchObject({ pageSize: 20, pageSizeCapped: true });
      const { listCustomersForAssistant } =
        await import('@/lib/services/customers/customers');
      const res = await listCustomersForAssistant(await h.actor(userId, TZ), {
        pageSize: 50,
      });
      expect(res.success && res.data.rows).toHaveLength(20);
      expect(res.success && res.data.pageInfo).toMatchObject({
        pageSize: 20,
        pageSizeCapped: true,
      });
    });

    it('AC-06: the chat adapter answers exactly what MCP answers (one registry)', async () => {
      const tools = await chatTools();
      for (const args of [
        { name: 'oohn doe' },
        { name: 'wayne enterprises' },
        {},
      ]) {
        const viaChat = await tools.list_customers.execute!(args, {});
        const viaMcp = await h.call(fullKey, 'list_customers', args);
        const { links: _links, ...answer } = viaChat;
        void _links;
        expect(answer).toEqual(viaMcp.structuredContent);
      }
    });

    // Nested so it shares the one harness (one container and one app Prisma client per file).
    describe('read answers on both channels (ai-chat-v2 T07)', () => {
      let userId: string;
      let fullKey: string;

      beforeEach(async () => {
        const prisma = h.factoryPrisma;
        await truncateAllTables(prisma);
        userId = (await createFreelancer(prisma, { timeZone: TZ })).id;
        ({ fullKey } = await createPersonalKey(prisma, userId));
      });

      async function chatTools() {
        const { createTurnContext } = await import('@/lib/ai/turn-context');
        const { createReadTools } = await import('@/lib/ai/tools/read-tools');
        const actor = await h.actor(userId, TZ);
        return createReadTools(
          createTurnContext({ actor, today: '2026-10-13' })
        ) as Record<string, { execute?: (i: any, c: any) => Promise<any> }>;
      }

      it('spec §6: no seeded full account number (with or without spaces) appears in any answer on either channel', async () => {
        const prisma = h.factoryPrisma;
        const studio = await createSenderProfile(prisma, userId, {
          name: 'Studio',
          isDefault: true,
        });
        await createBankAccount(prisma, studio.id, {
          currency: 'USD',
          accountNumber: NUMBERS.studio,
          iban: 'GB82WEST12345698765432',
          swift: 'TESTGB2L',
        });
        const fop = await createSenderProfile(prisma, userId, {
          name: 'Consulting FOP',
        });
        await createBankAccount(prisma, fop.id, {
          currency: 'UAH',
          accountNumber: NUMBERS.fop,
        });
        await createCustomer(prisma, userId, { name: 'Acme Corp' });
        await createProduct(prisma, userId, { name: 'Consulting' });

        const tools = await chatTools();
        const answers: unknown[] = [];
        for (const name of [
          'list_sender_profiles',
          'list_products',
          'list_customers',
        ]) {
          answers.push(await tools[name].execute!({}, {}));
          answers.push(await h.call(fullKey, name, {}));
        }
        const serialized = JSON.stringify(answers);
        expect(serialized).toContain('4821'); // the last four are there, so the walk is not vacuous
        expect(serialized).toContain('0915');
        for (const full of Object.values(NUMBERS)) {
          expect(serialized).not.toContain(full);
          expect(serialized).not.toContain(full.replace(/\s/g, ''));
        }
        expect(serialized).not.toContain('GB82WEST12345698765432');
        expect(serialized).not.toContain('TESTGB2L');
      });

      it('spec §6: every look-alike pair seeded as a Customer and a Product is found by the written form on both channels', async () => {
        const customers = new Map<string, string>();
        const products = new Map<string, string>();
        for (const [stored] of LOOK_ALIKE_PAIRS) {
          customers.set(
            stored,
            (await createCustomer(h.factoryPrisma, userId, { name: stored })).id
          );
          products.set(
            stored,
            (await createProduct(h.factoryPrisma, userId, { name: stored })).id
          );
        }
        for (const [stored, written, why] of LOOK_ALIKE_PAIRS) {
          for (const [tool, byStored, idKey] of [
            ['list_customers', customers, 'customerId'],
            ['list_products', products, 'productId'],
          ] as const) {
            // Each lookup is a separate question: its own turn and budget (T106).
            const viaChat = await (await chatTools())[tool].execute!({ name: written }, {});
            const viaMcp = await h.call(fullKey, tool, { name: written });
            const chatIds = viaChat.rows.map((r: any) => r[idKey]);
            const mcpIds = (viaMcp.structuredContent as any).rows.map(
              (r: any) => r[idKey]
            );
            expect(chatIds, `${tool} chat: ${why}`).toContain(
              byStored.get(stored)
            );
            expect(mcpIds, `${tool} mcp: ${why}`).toContain(
              byStored.get(stored)
            );
            expect(
              chatIds,
              `${tool}: same matches on both channels (${why})`
            ).toEqual(mcpIds);
          }
        }
      }, 120_000);
    });
  }
);

describe.runIf(!containerRuntimeAvailable)(
  'list_customers (ai-chat-v2 T07)',
  () => {
    it.skip('skipped: no container runtime', () => {});
  }
);
