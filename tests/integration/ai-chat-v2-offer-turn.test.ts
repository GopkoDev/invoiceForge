// T13, rewritten for the Question form by T55 (ai-chat-v2, AC-08, AC-08b, AC-09, AC-14, AC-37, AC-41; ADR-0002, ADR-0003,
// ADR-0011; sad §6 Flow 6): a drafting turn ends in at most ONE stored Question form, composed in code from the last
// propose_draft ISSUES (resolver questions) and the last valid ask_user call (chat questions), streamed as one data-offer
// part that carries only the form id, after the text and before data-outcome. A turn that parks a card has no form.
// More than 8 options give the model the count and an input-only question. A refused ask_user with no valid form
// ends in an input-only fallback form. A re-called propose_draft inside a pinned turn keeps the pinned record.
// The model is the scripted stand-in.
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
    it('AC-08: stores one OPEN form (kind FORM) with a Customer question tied to the saved reply and streams its id after the text', async () => {
      const user = await freelancer('t13-ac08@example.com');
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'USD' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp', email: 'billing@acme-corp.example.test' });
      await createCustomer(prisma, user.id, { name: 'Acme GmbH', email: 'billing@acme-gmbh.example.test' });
      const request = { customer: 'Acme', currency: 'USD', lines: LINES };
      script((i) =>
        i === 0
          ? { toolCall: { name: 'propose_draft', input: request } }
          : { text: 'Which Customer do you mean?' }
      );

      const parts = await send('invoice Acme for 20 hours at $50');

      const forms = await prisma.choiceOffer.findMany();
      expect(forms).toHaveLength(1);
      const [form] = forms;
      expect(form.state).toBe('OPEN');
      expect(form.kind).toBe('FORM');
      expect(form.request).toEqual(request);
      const questions = form.questions as any[];
      expect(questions).toHaveLength(1);
      expect(questions[0]).toMatchObject({ questionId: 0, field: 'CUSTOMER', source: 'RESOLVER', input: 'TEXT', required: true });
      expect(questions[0].options.map((o: any) => o.label).sort()).toEqual(['Acme Corp', 'Acme GmbH']);

      const reply = await prisma.conversationMessage.findFirstOrThrow({ where: { role: 'ASSISTANT' } });
      expect(form.messageId).toBe(reply.id);
      expect((reply.parts as any[]).find((p) => p.type === 'data-offer')).toEqual({
        type: 'data-offer',
        id: form.id,
        data: { offerId: form.id },
      });

      const offerChunks = parts.filter((p) => p.type === 'data-offer');
      expect(offerChunks).toEqual([{ type: 'data-offer', id: form.id, data: { offerId: form.id } }]);
      const t = types(parts);
      expect(t.indexOf('data-offer')).toBeGreaterThan(t.lastIndexOf('text-delta'));
      expect(t.indexOf('data-offer')).toBeLessThan(t.indexOf('data-outcome'));

      expect(await prisma.draftCard.count()).toBe(0);
    });
  });

  describe('AC-08b: Customer and bank account asked in one form', () => {
    it('AC-08b: "invoice Acme for 20 hours at $50" with two Acme Customers and two USD accounts holds one form: Customer, then the bank account, with the propose_draft request stored', async () => {
      const user = await freelancer('t13-ac08b@example.com');
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'EUR', bankName: 'Euro Bank', accountNumber: '5555555555' });
      await createBankAccount(prisma, profile.id, { currency: 'USD', bankName: 'Alpha Bank', accountNumber: '1111111111' });
      await createBankAccount(prisma, profile.id, { currency: 'USD', bankName: 'Beta Bank', accountNumber: '2222222222' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp', email: 'billing@acme-corp.example.test' });
      await createCustomer(prisma, user.id, { name: 'Acme GmbH', email: 'billing@acme-gmbh.example.test' });
      const request = { customer: 'Acme', currency: 'USD', lines: LINES };
      script((i) =>
        i === 0 ? { toolCall: { name: 'propose_draft', input: request } } : { text: 'Please answer both questions.' }
      );

      const parts = await send('invoice Acme for 20 hours at $50');

      expect(parts.filter((p) => p.type === 'data-offer')).toHaveLength(1);
      const forms = await prisma.choiceOffer.findMany();
      expect(forms).toHaveLength(1);
      expect(forms[0].kind).toBe('FORM');
      expect(forms[0].request).toEqual(request);
      const questions = forms[0].questions as any[];
      expect(questions.map((q) => [q.questionId, q.field])).toEqual([[0, 'CUSTOMER'], [1, 'BANK_ACCOUNT']]);
      expect(questions[0].options.map((o: any) => o.label).sort()).toEqual(['Acme Corp', 'Acme GmbH']);
      expect(questions[1].options.map((o: any) => o.label)).toEqual(['Alpha Bank ••1111 · USD', 'Beta Bank ••2222 · USD']);
      expect(await prisma.draftCard.count()).toBe(0);
    });
  });

  describe('AC-09: the options are the found records, whatever the text says', () => {
    it('AC-09: a reply naming an account the draft action did not find leaves the stored questions equal to the form builder output', async () => {
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
      const { formFromIssues, composeForm } = await import('@/lib/services/assistant-drafts/forms');
      const actor = await actingFreelancerForTest(user.id, TZ);
      const resolved: any = await resolveDraftRequest(actor, request as any, TODAY);
      expect(resolved.data.kind).toBe('ISSUES');
      const built = composeForm(formFromIssues(resolved.data.issues, { invoiceCurrency: 'USD', today: TODAY, timeZone: TZ }), []);
      expect(built).toHaveLength(1);

      const forms = await prisma.choiceOffer.findMany();
      expect(forms).toHaveLength(1);
      expect(forms[0].kind).toBe('FORM');
      expect(forms[0].questions).toEqual(built);
      const labels = ((forms[0].questions as any[])[0].options as any[]).map((o) => o.label);
      expect(labels).toEqual(['Alpha Bank ••1111 · USD', 'Beta Bank ••2222 · USD']);
      expect(JSON.stringify(forms[0].questions)).not.toMatch(/Evil|9999/);
    });
  });

  describe('AC-14: more than 8 matches', () => {
    it('AC-14: 12 "Studio" Customers give a form whose Customer question has no options and matchCount 12, and the model is told the count', async () => {
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

      const forms = await prisma.choiceOffer.findMany();
      expect(forms).toHaveLength(1);
      const customerQuestion = (forms[0].questions as any[]).find((q) => q.field === 'CUSTOMER');
      expect(customerQuestion).toMatchObject({ options: [], matchCount: 12, source: 'RESOLVER', input: 'TEXT' });
      expect(JSON.stringify(forms[0])).not.toContain('Studio A');
      expect(parts.filter((p) => p.type === 'data-offer')).toEqual([{ type: 'data-offer', id: forms[0].id, data: { offerId: forms[0].id } }]);
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
      const forms = await prisma.choiceOffer.findMany();
      expect(forms).toHaveLength(1);
      expect(JSON.stringify(forms[0])).not.toContain('Studio A');
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

    // Review 2026-10-13 R3-B2: a read turn where the model also tried propose_draft and was refused (NOT_REQUESTED)
    // drafted nothing, so the read's add page stays.
    it('a read turn whose propose_draft was refused keeps "Add a Customer"', async () => {
      const user = await freelancer('t13-read-refused@example.com');
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'USD' });
      model = scriptedModel({
        verdict: { topic: 'in_scope', language: 'en', intent: 'read' },
        steps: (i) =>
          i === 0
            ? { toolCall: { name: 'list_customers', input: { name: 'Globex' } } }
            : i === 1
              ? { toolCall: { name: 'propose_draft', input: { customer: 'Globex', currency: 'USD', lines: LINES } } }
              : { text: 'You have no Customer called Globex.' },
      });

      const parts = await send('find the Customer Globex');

      expect(linkPages(parts)).toContain('new-customer');
    });

    // Review 2026-10-13 R3-B1: the AC-05b own-profile name never gets "Add a Customer", even from a read-only turn.
    it('a read-only turn for the own sender profile name shows no "Add a Customer"', async () => {
      const user = await freelancer('t13-own-profile-readonly@example.com');
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main', isDefault: true });
      await createBankAccount(prisma, profile.id, { currency: 'USD' });
      await createSenderProfile(prisma, user.id, { name: 'Consulting FOP', isDefault: false });
      model = scriptedModel({
        verdict: { topic: 'in_scope', language: 'en', intent: 'read' },
        steps: (i) =>
          i === 0
            ? { toolCall: { name: 'list_customers', input: { name: 'consulting  fop' } } }
            : { text: 'Consulting FOP is your own sender profile, not a Customer.' },
      });

      const parts = await send('is Consulting FOP a customer?');

      expect(linkPages(parts)).not.toContain('new-customer');
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
    it('AC-41: with propose_draft called twice on different issues, the one form comes from the LAST call, with that call\'s request', async () => {
      const user = await freelancer('t13-last@example.com');
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'USD' });
      await createCustomer(prisma, user.id, { name: 'Acme Corp', email: 'a@acme-corp.example.test' });
      await createCustomer(prisma, user.id, { name: 'Acme GmbH', email: 'a@acme-gmbh.example.test' });
      await createCustomer(prisma, user.id, { name: 'Beta One', email: 'b@beta-one.example.test' });
      await createCustomer(prisma, user.id, { name: 'Beta Two', email: 'b@beta-two.example.test' });
      const second = { customer: 'Beta', currency: 'USD', lines: LINES };
      script((i) =>
        i === 0
          ? { toolCall: { name: 'propose_draft', input: { customer: 'Acme', currency: 'USD', lines: LINES } } }
          : i === 1
            ? { toolCall: { name: 'propose_draft', input: second } }
            : { text: 'Which one?' }
      );

      const parts = await send('invoice Acme and Beta');

      expect(parts.filter((p) => p.type === 'data-offer')).toHaveLength(1);
      const forms = await prisma.choiceOffer.findMany();
      expect(forms).toHaveLength(1);
      expect(forms[0].request).toEqual(second);
      const options = (forms[0].questions as any[])[0].options as any[];
      expect(options.map((o) => o.label).sort()).toEqual(['Beta One', 'Beta Two']);
    });

    it('AC-41: a turn that ends with a card has no form, even after an issue earlier in the turn', async () => {
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

    it('a turn with no question at all has no form and no data-offer part', async () => {
      const user = await freelancer('t13-noform@example.com');
      await createSenderProfile(prisma, user.id, { name: 'Main' });
      script(() => ({ text: 'Hello! I can draft invoices for you.' }));

      const parts = await send('hello');

      expect(types(parts)).not.toContain('data-offer');
      expect(await prisma.choiceOffer.count()).toBe(0);
    });
  });

  describe('ask_user: the chat\'s questions in the same one form (AC-37, AC-41; ADR-0011)', () => {
    async function world(email: string, customers = 4) {
      const user = await freelancer(email);
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'USD' });
      const made = [];
      for (let n = 1; n <= customers; n++) made.push(await createCustomer(prisma, user.id, { name: `Client ${n}` }));
      return { user, customers: made };
    }
    const askCustomerAndPrice = (ids: string[]) => ({
      questions: [
        { field: 'CUSTOMER', prompt: 'Which Customer is this for?', recordIds: ids },
        { field: 'PRICE', lineIndex: 0, prompt: 'What is the hourly price?' },
      ],
    });

    it('AC-37: ask_user with four Customer ids and a price question stores one FORM row: Customer (4 options) and "Line 1 · Price" (input only); the reply text is stored', async () => {
      const { customers } = await world('t13-ac37@example.com');
      script((i) =>
        i === 0
          ? { toolCall: { name: 'ask_user', input: askCustomerAndPrice(customers.map((c) => c.id)) } }
          : { text: 'Here are your Customers, and one thing I still need.' }
      );

      const parts = await send('invoice web dev 10 hours, but show me the list of Customers');

      const forms = await prisma.choiceOffer.findMany();
      expect(forms).toHaveLength(1);
      expect(forms[0]).toMatchObject({ kind: 'FORM', state: 'OPEN', request: null });
      const questions = forms[0].questions as any[];
      expect(questions.map((q) => [q.field, q.heading, q.lineIndex, q.source])).toEqual([
        ['CUSTOMER', 'Customer', null, 'CHAT'],
        ['PRICE', 'Line 1 · Price', 0, 'CHAT'],
      ]);
      expect(questions[0].options.map((o: any) => o.label).sort()).toEqual(['Client 1', 'Client 2', 'Client 3', 'Client 4']);
      expect(questions[0].options.map((o: any) => o.ref.customerId).sort()).toEqual(customers.map((c) => c.id).sort());
      expect(questions[1]).toMatchObject({ options: [], input: 'AMOUNT', required: true });
      const reply = await prisma.conversationMessage.findFirstOrThrow({ where: { role: 'ASSISTANT' } });
      expect(JSON.stringify(reply.parts)).toContain('Here are your Customers, and one thing I still need.');
      expect(forms[0].messageId).toBe(reply.id);
      expect(parts.filter((p) => p.type === 'data-offer')).toEqual([{ type: 'data-offer', id: forms[0].id, data: { offerId: forms[0].id } }]);
      expect(await prisma.draftCard.count()).toBe(0);
    });

    it('a partial draft passed to ask_user is the form\'s stored request when no propose_draft request exists', async () => {
      const { customers } = await world('t13-askdraft@example.com', 2);
      script((i) =>
        i === 0
          ? { toolCall: { name: 'ask_user', input: { draft: { currency: 'USD' }, ...askCustomerAndPrice(customers.map((c) => c.id)) } } }
          : { text: 'One moment.' }
      );

      await send('invoice web dev 10 hours in USD');

      const forms = await prisma.choiceOffer.findMany();
      expect(forms).toHaveLength(1);
      expect(forms[0].request).toMatchObject({ currency: 'USD' });
    });

    it('one form per reply: propose_draft ISSUES and ask_user together compose resolver and chat questions in the app order, with the propose_draft request', async () => {
      const { user, customers } = await world('t13-compose@example.com', 0);
      await createCustomer(prisma, user.id, { name: 'Acme Corp', email: 'a@acme-corp.example.test' });
      await createCustomer(prisma, user.id, { name: 'Acme GmbH', email: 'a@acme-gmbh.example.test' });
      void customers;
      const request = { customer: 'Acme', currency: 'USD', lines: [{ description: 'Consulting', quantity: '20' }] };
      script((i) =>
        i === 0
          ? { toolCalls: [{ name: 'ask_user', input: { questions: [{ field: 'NOTES', prompt: 'Any note for the invoice?', optional: true }] } }, { name: 'propose_draft', input: request }] }
          : { text: 'Two things.' }
      );

      await send('invoice Acme for 20 hours');

      const forms = await prisma.choiceOffer.findMany();
      expect(forms).toHaveLength(1);
      expect(forms[0].request).toEqual(request);
      const fields = (forms[0].questions as any[]).map((q) => q.field);
      expect(fields[0]).toBe('CUSTOMER');
      expect(fields).toContain('NOTES');
      expect(fields.indexOf('CUSTOMER')).toBeLessThan(fields.indexOf('NOTES'));
    });

    it('AC-41: propose_draft finding a card and ask_user in one turn: the card part only, no form row, no data-offer', async () => {
      const { customers } = await world('t13-ac41@example.com', 1);
      script((i) =>
        i === 0
          ? {
              toolCalls: [
                { name: 'propose_draft', input: { customerId: customers[0].id, currency: 'USD', lines: LINES } },
                { name: 'ask_user', input: { questions: [{ field: 'NOTES', prompt: 'Any note?', optional: true }] } },
              ],
            }
          : { text: 'Here is the draft.' }
      );

      const parts = await send('invoice Client 1 for 20 hours at $50');

      expect(types(parts)).toContain('data-draft-card');
      expect(types(parts)).not.toContain('data-offer');
      expect(await prisma.choiceOffer.count()).toBe(0);
      expect(await prisma.draftCard.count()).toBe(1);
    });

    it('AC-41: two ask_user calls give one form, from the last valid call', async () => {
      const { customers } = await world('t13-twoask@example.com', 3);
      script((i) =>
        i === 0
          ? { toolCall: { name: 'ask_user', input: { questions: [{ field: 'CUSTOMER', prompt: 'Which Customer?', recordIds: customers.map((c) => c.id) }] } } }
          : i === 1
            ? { toolCall: { name: 'ask_user', input: { questions: [{ field: 'PRICE', lineIndex: 0, prompt: 'What is the price?' }] } } }
            : { text: 'One question.' }
      );

      const parts = await send('invoice web dev');

      expect(parts.filter((p) => p.type === 'data-offer')).toHaveLength(1);
      const forms = await prisma.choiceOffer.findMany();
      expect(forms).toHaveLength(1);
      expect((forms[0].questions as any[]).map((q) => q.field)).toEqual(['PRICE']);
    });

    it('a refused ask_user call after a valid one keeps the valid form (chat source, not fallback)', async () => {
      const { customers } = await world('t13-valid-then-refused@example.com', 2);
      script((i) =>
        i === 0
          ? { toolCall: { name: 'ask_user', input: { questions: [{ field: 'CUSTOMER', prompt: 'Which Customer?', recordIds: customers.map((c) => c.id) }] } } }
          : i === 1
            ? { toolCall: { name: 'ask_user', input: { questions: [{ field: 'CUSTOMER', prompt: 'Which Customer?', recordIds: ['clx0neverexisted0000000001'] }] } } }
            : { text: 'One question.' }
      );

      await send('invoice web dev');

      const forms = await prisma.choiceOffer.findMany();
      expect(forms).toHaveLength(1);
      const questions = forms[0].questions as any[];
      expect(questions.map((q) => [q.field, q.source])).toEqual([['CUSTOMER', 'CHAT']]);
      expect(questions[0].options).toHaveLength(2);
    });

    it('fallback: a refused ask_user call and no valid form at the end of the turn stores an input-only form (source FALLBACK) from the asked fields', async () => {
      await world('t13-fallback@example.com', 1);
      script((i) =>
        i === 0
          ? {
              toolCall: {
                name: 'ask_user',
                input: {
                  questions: [
                    { field: 'CUSTOMER', prompt: 'Which Customer is this for?', recordIds: ['clx0neverexisted0000000001'] },
                    { field: 'PRICE', lineIndex: 0, prompt: 'What is the hourly price?' },
                  ],
                },
              },
            }
          : { text: 'I need two things from you.' }
      );

      const parts = await send('invoice web dev 10 hours');

      expect(parts.filter((p) => p.type === 'data-offer')).toHaveLength(1);
      const forms = await prisma.choiceOffer.findMany();
      expect(forms).toHaveLength(1);
      expect(forms[0].kind).toBe('FORM');
      const questions = forms[0].questions as any[];
      expect(questions.map((q) => [q.field, q.source, q.options.length])).toEqual([
        ['CUSTOMER', 'FALLBACK', 0],
        ['PRICE', 'FALLBACK', 0],
      ]);
      expect(questions[0].input).toBe('TEXT');
      expect(questions[1].input).toBe('AMOUNT');
      expect(JSON.stringify(forms[0])).not.toContain('clx0neverexisted0000000001');
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

    // Review 2026-10-13 R3-B4 (AC-14): a press whose next choice has more than 8 options offers no buttons, and the
    // pinned step the model sees, like the fallback words, gives the count and none of the names.
    it('AC-14: a pinned resolution with 9 matching accounts: an input-only bank account question with the count, the count in words, no account named', async () => {
      const user = await createFreelancer(prisma, { email: 't13-pinned-many@example.com', timeZone: TZ });
      const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
      await createBankAccount(prisma, profile.id, { currency: 'EUR', bankName: 'Euro Bank', accountNumber: '5555555555' });
      for (let n = 0; n < 9; n++) {
        await createBankAccount(prisma, profile.id, { currency: 'USD', bankName: `Bank${n}`, accountNumber: `100000000${n}` });
      }
      const acme = await createCustomer(prisma, user.id, { name: 'Acme Corp' });
      const actor = await actingFreelancerForTest(user.id, TZ);
      const { runTurn } = await import('@/lib/ai/run-turn');
      const { resolveDraftRequest } = await import('@/lib/services/assistant-drafts/resolve');
      const request: any = { customerId: acme.id, currency: 'USD', lines: LINES };
      const resolved: any = await resolveDraftRequest(actor, request, TODAY);
      expect(resolved.data.kind).toBe('ISSUES');
      const prompts = script(() => ({ text: '' }));

      const { stream, result } = await runTurn({
        actor,
        today: TODAY,
        history: [],
        message: 'Acme Corp',
        signal: new AbortController().signal,
        pinned: { request, resolution: resolved.data },
      });
      const chunks: any[] = [];
      for await (const chunk of stream) chunks.push(chunk);
      const out: any = await result;

      expect(out.pendingOffer).toBeUndefined();
      expect(out.pendingForm.request).toEqual(request);
      expect(out.pendingForm.questions).toHaveLength(1);
      expect(out.pendingForm.questions[0]).toMatchObject({ field: 'BANK_ACCOUNT', options: [], matchCount: 9, source: 'RESOLVER' });
      expect(JSON.stringify(out.pendingForm)).not.toMatch(/Bank\d/);
      expect(out.text).toContain('You have 9 bank accounts in USD.');
      expect(out.text).not.toMatch(/Bank\d/);
      expect(JSON.stringify(prompts[0])).not.toMatch(/Bank\d/);
    });

    it('a pinned ISSUES resolution is the turn\'s pending form (resolver questions), continuing the pinned request', async () => {
      const { request, resolution, run } = await setup();
      expect(resolution.kind).toBe('ISSUES');
      model = scriptedModel({ verdict: { topic: 'in_scope', language: 'en', intent: 'draft' }, steps: () => ({ text: 'Which account?' }) });

      const result: any = await run();

      expect(result.pendingCard).toBeUndefined();
      expect(result.pendingOffer).toBeUndefined();
      expect(result.pendingForm).toBeDefined();
      expect(typeof result.pendingForm.id).toBe('string');
      expect(result.pendingForm.request).toEqual(request);
      expect(result.pendingForm.questions).toHaveLength(1);
      expect(result.pendingForm.questions[0]).toMatchObject({ questionId: 0, field: 'BANK_ACCOUNT', source: 'RESOLVER' });
      expect(result.pendingForm.questions[0].options.map((o: any) => o.label)).toEqual(['Alpha Bank ••1111 · USD', 'Beta Bank ••2222 · USD']);
    });

    // Review 2026-10-13 R1-S1: a re-call cannot replace the code-built offer, not even with a bank account the model
    // picked itself ("Alpha" was never the Freelancer's word): the account is still offered (AC-08b, no guessing).
    it('a re-called propose_draft (other Customer name, a model-picked account) keeps the pinned form and parks no card', async () => {
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
      expect(result.pendingForm.questions[0].field).toBe('BANK_ACCOUNT');
      expect(result.pendingForm.request.customerId).toBe(cyrillic.id);
      expect(result.pendingForm.request.bankAccount).toBeUndefined();
    });
  });
});
