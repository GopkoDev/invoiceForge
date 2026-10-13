// T13 (ai-chat-v2, AC-08, AC-09, AC-14; ADR-0002, ADR-0003; sad §6 Flow 6): a drafting turn whose resolver issue is
// offer-able ends in ONE stored Offered choice built in code (offerFromIssues), streamed as a data-offer part that
// carries only the offer id, after the text and before data-outcome. More than 8 options give the model the count and
// no offer. A re-called propose_draft inside a pinned turn keeps the pinned record. The model is the scripted stand-in.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { MockLanguageModelV4 } from 'ai/test';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from './../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from './../support/db/container';
import { createTestPrismaClient } from './../support/db/client';
import { truncateAllTables } from './../support/db/truncate';
import { createFreelancer } from './../support/factories/user';
import { createCustomer } from './../support/factories/customer';
import { createSenderProfile } from './../support/factories/sender-profile';
import { createBankAccount } from './../support/factories/bank-account';
import { actingFreelancerForTest } from './../support/acting-freelancer';
import { partsOfText, scriptedModel, type StubStep } from './../support/ai-stub-model';

const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TODAY = '2026-03-15';
const TZ = 'Europe/Kyiv';
const LINES = [{ description: 'Consulting', quantity: '20', price: '50' }];

describe.runIf(containerRuntimeAvailable)('an offer-able issue becomes the reply\'s Offered choice (T13)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;
  let appPrisma: PrismaClient;
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
    ({ prisma: appPrisma } = (await import('@/prisma')) as { prisma: PrismaClient });
    ({ POST } = (await import('@/app/api/chat/route')) as { POST: (req: NextRequest) => Promise<Response> });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await appPrisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => {
    authMock.mockReset();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await truncateAllTables(prisma);
  });

  /** Records every prompt the agent model is called with. */
  function script(step: (i: number) => StubStep) {
    const prompts: any[] = [];
    model = scriptedModel({
      verdict: { topic: 'in_scope', language: 'en', intent: 'draft' },
      steps: (i, prompt) => {
        prompts.push(prompt);
        return step(i);
      },
    });
    return prompts;
  }

  async function freelancer(email: string) {
    const user = await createFreelancer(prisma, { email, timeZone: TZ });
    authMock.mockResolvedValue({ user: { id: user.id } });
    return user;
  }

  async function send(text: string) {
    const response = await POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId: null, message: { id: 'msg_client_01', role: 'user', parts: [{ type: 'text', text }] } }),
      })
    );
    return partsOfText(await response.text());
  }

  const types = (parts: any[]) => parts.map((p) => p.type);
  const toolResultText = (prompt: any) =>
    JSON.stringify((prompt as any[]).filter((m) => m.role === 'tool'));

  describe('AC-08: two Customers match "Acme"', () => {
    it('AC-08: stores one OPEN CUSTOMER offer tied to the saved reply and streams its id after the text', async () => {
      const user = await freelancer('t13-ac08@example.com');
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'USD' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp', email: 'billing@acme-corp.example.test' });
      await createCustomer(prisma, user.id, { name: 'Acme GmbH', email: 'billing@acme-gmbh.example.test' });
      script((i) =>
        i === 0
          ? { toolCall: { name: 'propose_draft', input: { customer: 'Acme', currency: 'USD', lines: LINES } } }
          : { text: 'Which Customer do you mean?' }
      );

      const parts = await send('invoice Acme for 20 hours at $50');

      const offers = await prisma.choiceOffer.findMany();
      expect(offers).toHaveLength(1);
      const [offer] = offers;
      expect(offer.state).toBe('OPEN');
      expect(offer.kind).toBe('CUSTOMER');
      expect((offer.options as any[]).map((o) => o.label).sort()).toEqual(['Acme Corp', 'Acme GmbH']);

      const reply = await prisma.conversationMessage.findFirstOrThrow({ where: { role: 'ASSISTANT' } });
      expect(offer.messageId).toBe(reply.id);
      expect((reply.parts as any[]).find((p) => p.type === 'data-offer')).toEqual({
        type: 'data-offer',
        id: offer.id,
        data: { offerId: offer.id },
      });

      const offerChunks = parts.filter((p) => p.type === 'data-offer');
      expect(offerChunks).toEqual([{ type: 'data-offer', id: offer.id, data: { offerId: offer.id } }]);
      const t = types(parts);
      expect(t.indexOf('data-offer')).toBeGreaterThan(t.lastIndexOf('text-delta'));
      expect(t.indexOf('data-offer')).toBeLessThan(t.indexOf('data-outcome'));

      expect(await prisma.draftCard.count()).toBe(0);
    });
  });

  describe('AC-09: the buttons are the found options, whatever the text says', () => {
    it('AC-09: a reply naming an account the draft action did not find leaves the stored options equal to the builder output', async () => {
      const user = await freelancer('t13-ac09@example.com');
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      // The default account is EUR, so USD has two accounts and none is preferred: SEVERAL_ACCOUNTS_IN_CURRENCY.
      await createBankAccount(prisma, profile.id, { currency: 'EUR', bankName: 'Euro Bank', accountNumber: '5555555555' });
      await createBankAccount(prisma, profile.id, { currency: 'USD', bankName: 'Alpha Bank', accountNumber: '1111111111' });
      await createBankAccount(prisma, profile.id, { currency: 'USD', bankName: 'Beta Bank', accountNumber: '2222222222' });
      await createCustomer(prisma, user.id, { name: 'Globex' });
      const request = { customer: 'Globex', currency: 'USD', lines: LINES };
      script((i) =>
        i === 0
          ? { toolCall: { name: 'propose_draft', input: request } }
          : { text: 'Which account? Please pick Evil Bank ••9999 or Alpha Bank ••1111.' }
      );

      await send('invoice Globex 20 hours at $50 in USD');

      const { resolveDraftRequest } = await import('@/lib/services/assistant-drafts/resolve');
      const { offerFromIssues } = await import('@/lib/services/assistant-drafts/offers');
      const actor = await actingFreelancerForTest(user.id, TZ);
      const resolved: any = await resolveDraftRequest(actor, request as any, TODAY);
      expect(resolved.data.kind).toBe('ISSUES');
      const built: any = offerFromIssues(resolved.data.issues, { invoiceCurrency: 'USD' });
      expect(built.kind).toBe('OFFER');

      const offers = await prisma.choiceOffer.findMany();
      expect(offers).toHaveLength(1);
      expect(offers[0].kind).toBe('BANK_ACCOUNT');
      expect(offers[0].options).toEqual(built.options);
      const labels = (offers[0].options as any[]).map((o) => o.label);
      expect(labels).toEqual(['Alpha Bank ••1111 · USD', 'Beta Bank ••2222 · USD']);
      expect(JSON.stringify(offers[0].options)).not.toMatch(/Evil|9999/);
    });
  });

  describe('AC-14: more than 8 matches', () => {
    it('AC-14: 12 "Studio" Customers give no offer row and no data-offer chunk, and the model is told the count', async () => {
      const user = await freelancer('t13-ac14@example.com');
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'EUR' });
      for (let n = 1; n <= 12; n++) {
        await createCustomer(prisma, user.id, { name: `Studio ${String.fromCharCode(64 + n)}` });
      }
      const prompts = script((i) =>
        i === 0
          ? { toolCall: { name: 'propose_draft', input: { customer: 'Studio', currency: 'EUR', lines: [{ description: 'Work', quantity: '3', price: '450' }] } } }
          : { text: '12 Customers match. Please type a more exact name.' }
      );

      const parts = await send('invoice Studio for 3 days at 450 EUR a day');

      expect(await prisma.choiceOffer.count()).toBe(0);
      expect(types(parts)).not.toContain('data-offer');
      expect(prompts.length).toBeGreaterThanOrEqual(2);
      expect(toolResultText(prompts[1])).toMatch(/matchCount\\?"?\s*:\s*12\b/);
      // Review 2026-10-13 R2-B2: the answer lists none of the 12, so the model cannot list them either.
      expect(toolResultText(prompts[1])).not.toContain('Studio A');
    });

    it('AC-14: when the model writes nothing, the chat says the count and asks for a more exact name, naming none', async () => {
      const user = await freelancer('t13-ac14-words@example.com');
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'EUR' });
      for (let n = 1; n <= 12; n++) {
        await createCustomer(prisma, user.id, { name: `Studio ${String.fromCharCode(64 + n)}` });
      }
      script((i) =>
        i === 0
          ? { toolCall: { name: 'propose_draft', input: { customer: 'Studio', currency: 'EUR', lines: [{ description: 'Work', quantity: '3', price: '450' }] } } }
          : { text: '' }
      );

      const parts = await send('invoice Studio for 3 days at 450 EUR a day');

      const text = parts.filter((p: any) => p.type === 'text-delta').map((p: any) => p.delta).join('');
      expect(text).toContain('12 Customers match Studio. Type a more exact name.');
      expect(text).not.toContain('Studio A');
      expect(types(parts)).not.toContain('data-offer');
    });
  });

  // Review 2026-10-13 R2-B3: the add-page link of an empty named read belongs to a read answer. In a drafting turn
  // (propose_draft called) the draft's own links decide: no "Add a Customer" under the AC-05b own-profile reply.
  describe('AC-05 / AC-05b: add-page links of an empty read', () => {
    const linkPages = (parts: any[]) => parts.filter((p) => p.type === 'data-link').map((p) => p.data.page);

    it('a read answer that found nothing carries "Add a Customer"', async () => {
      const user = await freelancer('t13-read-none@example.com');
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'USD' });
      model = scriptedModel({
        verdict: { topic: 'in_scope', language: 'en', intent: 'read' },
        steps: (i) => (i === 0 ? { toolCall: { name: 'list_customers', input: { name: 'Globex' } } } : { text: 'You have no Customer called Globex.' }),
      });

      const parts = await send('find the Customer Globex');

      expect(linkPages(parts)).toContain('new-customer');
    });

    it('a drafting turn that also looked the name up shows no "Add a Customer" for the own sender profile', async () => {
      const user = await freelancer('t13-own-profile-read@example.com');
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main', isDefault: true });
      await createBankAccount(prisma, profile.id, { currency: 'USD' });
      const fop = await createSenderProfile(prisma, user.id, { name: 'Consulting FOP', isDefault: false });
      await createBankAccount(prisma, fop.id, { currency: 'UAH' });
      script((i) =>
        i === 0
          ? { toolCall: { name: 'list_customers', input: { name: 'Consulting FOP' } } }
          : i === 1
            ? { toolCall: { name: 'propose_draft', input: { customer: 'Consulting FOP', currency: 'USD', lines: LINES } } }
            : { text: 'Consulting FOP is your own sender profile. Which Customer should this invoice go to?' }
      );

      const parts = await send('invoice Consulting FOP for 10 hours at 40 USD');

      expect(linkPages(parts)).not.toContain('new-customer');
    });
  });

  describe('turn-level edges', () => {
    it('keeps only the first offer when propose_draft is called twice with different offer-able issues', async () => {
      const user = await freelancer('t13-first@example.com');
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'USD' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp', email: 'a@acme-corp.example.test' });
      await createCustomer(prisma, user.id, { name: 'Acme GmbH', email: 'a@acme-gmbh.example.test' });
      await createCustomer(prisma, user.id, { name: 'Beta One', email: 'b@beta-one.example.test' });
      await createCustomer(prisma, user.id, { name: 'Beta Two', email: 'b@beta-two.example.test' });
      script((i) =>
        i === 0
          ? {
              toolCalls: [
                { name: 'propose_draft', input: { customer: 'Acme', currency: 'USD', lines: LINES } },
                { name: 'propose_draft', input: { customer: 'Beta', currency: 'USD', lines: LINES } },
              ],
            }
          : { text: 'Which one?' }
      );

      const parts = await send('invoice Acme and Beta');

      expect(parts.filter((p) => p.type === 'data-offer')).toHaveLength(1);
      const offers = await prisma.choiceOffer.findMany();
      expect(offers).toHaveLength(1);
      expect((offers[0].options as any[]).map((o) => o.label).sort()).toEqual(['Acme Corp', 'Acme GmbH']);
    });

    it('a turn that ends with a card has no offer, even after an offer-able issue earlier in the turn', async () => {
      const user = await freelancer('t13-card@example.com');
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'USD' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp', email: 'a@acme-corp.example.test' });
      const gmbh = await createCustomer(prisma, user.id, { name: 'Acme GmbH', email: 'a@acme-gmbh.example.test' });
      script((i) => {
        if (i === 0) return { toolCall: { name: 'propose_draft', input: { customer: 'Acme', currency: 'USD', lines: LINES } } };
        if (i === 1) return { toolCall: { name: 'propose_draft', input: { customerId: gmbh.id, currency: 'USD', lines: LINES } } };
        return { text: 'Here is the draft.' };
      });

      const parts = await send('invoice Acme for 20 hours at $50');

      expect(types(parts)).toContain('data-draft-card');
      expect(types(parts)).not.toContain('data-offer');
      expect(await prisma.choiceOffer.count()).toBe(0);
      expect(await prisma.draftCard.count()).toBe(1);
    });
  });
  describe('runTurn from a pinned ISSUES resolution (ADR-0003)', () => {
    async function setup() {
      const user = await createFreelancer(prisma, { email: 't13-pinned@example.com', timeZone: TZ });
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'EUR', bankName: 'Euro Bank', accountNumber: '5555555555' });
      await createBankAccount(prisma, profile.id, { currency: 'USD', bankName: 'Alpha Bank', accountNumber: '1111111111' });
      await createBankAccount(prisma, profile.id, { currency: 'USD', bankName: 'Beta Bank', accountNumber: '2222222222' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp', email: 'billing@acme.example.test' });
      const cyrillic = await createCustomer(prisma, user.id, { name: 'Аcme Corp', email: 'ap@acme-ua.example.test' }); // Cyrillic "А"
      const actor = await actingFreelancerForTest(user.id, TZ);
      const { runTurn } = await import('@/lib/ai/run-turn');
      const { resolveDraftRequest } = await import('@/lib/services/assistant-drafts/resolve');
      const request: any = { customerId: cyrillic.id, currency: 'USD', lines: LINES };
      const resolved: any = await resolveDraftRequest(actor, request, TODAY);
      const run = async () => {
        const { stream, result } = await runTurn({
          actor,
          today: TODAY,
          history: [],
          message: 'Аcme Corp',
          signal: new AbortController().signal,
          pinned: { request, resolution: resolved.data },
        });
        for await (const chunk of stream) void chunk;
        return result;
      };
      return { cyrillic, request, resolution: resolved.data, run };
    }

    it('a pinned ISSUES resolution is the turn\'s pending offer, continuing the pinned request', async () => {
      const { request, resolution, run } = await setup();
      expect(resolution.kind).toBe('ISSUES');
      model = scriptedModel({ verdict: { topic: 'in_scope', language: 'en', intent: 'draft' }, steps: () => ({ text: 'Which account?' }) });

      const result: any = await run();

      expect(result.pendingCard).toBeUndefined();
      expect(result.pendingOffer).toBeDefined();
      expect(result.pendingOffer.kind).toBe('BANK_ACCOUNT');
      expect(result.pendingOffer.request).toEqual(request);
      expect(result.pendingOffer.options.map((o: any) => o.label)).toEqual(['Alpha Bank ••1111 · USD', 'Beta Bank ••2222 · USD']);
    });

    // Review 2026-10-13 R1-S1: a re-call cannot replace the code-built offer, not even with a bank account the model
    // picked itself ("Alpha" was never the Freelancer's word): the account is still offered (AC-08b, no guessing).
    it('a re-called propose_draft (other Customer name, a model-picked account) keeps the pinned offer and parks no card', async () => {
      const { cyrillic, run } = await setup();
      model = scriptedModel({
        verdict: { topic: 'in_scope', language: 'en', intent: 'draft' },
        steps: (i) =>
          i === 0
            ? { toolCall: { name: 'propose_draft', input: { customer: 'Acme Corp', currency: 'USD', bankAccount: 'Alpha', lines: LINES } } }
            : { text: 'Here is the draft.' },
      });

      const result: any = await run();

      expect(result.pendingCard).toBeUndefined();
      expect(result.pendingOffer.kind).toBe('BANK_ACCOUNT');
      expect(result.pendingOffer.request.customerId).toBe(cyrillic.id);
      expect(result.pendingOffer.request.bankAccount).toBeUndefined();
    });
  });
});
