// ai-chat-v2 T27 (spec.md §5 AC-34; contracts/server-actions.md §Data export, §Account deletion; data-model.md
// §ChoiceOffer «Export»): the data export (2.3) carries every Conversation's start point, each message's origin and
// each reply's Offered choices with labels, state and the chosen option — never record references or the stored
// draft request — and account / Conversation deletion leaves no ChoiceOffer behind. Throwaway Postgres.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../support/db/container';
import { createTestPrismaClient } from '../support/db/client';
import { truncateAllTables } from '../support/db/truncate';
import { createFreelancer } from '../support/factories/user';
import { createSenderProfile } from '../support/factories/sender-profile';
import { createCustomer } from '../support/factories/customer';
import { createBankAccount } from '../support/factories/bank-account';
import { createInvoice } from '../support/factories/invoice';
import { createConversation } from '../support/factories/conversation';
import {
  createChoiceOffer,
  defaultOfferOptions,
} from '../support/factories/choice-offer';
import { createDraftCard } from '../support/factories/draft-card';
import { actingFreelancerForTest } from '../support/acting-freelancer';
import {
  assertMatchesContract,
  SECURITY_PATCH_SPEC_PATH,
} from '../support/contract/validate';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  startSpan: (_o: unknown, run: (s?: unknown) => unknown) => run(undefined),
}));

describe.runIf(containerRuntimeAvailable)(
  'ai-chat-v2 export 2.3 and deletion (T27, AC-34)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let account: typeof import('@/lib/services/account/account');
    let conversations: typeof import('@/lib/services/conversations/delete');

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      account = await import('@/lib/services/account/account');
      conversations = await import('@/lib/services/conversations/delete');
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await db?.stop();
    });

    afterEach(async () => {
      await truncateAllTables(prisma);
    });

    /** A Freelancer who typed, pressed an Offered choice and sent a prompt from the dashboard. */
    async function chatUser() {
      const freelancer = await createFreelancer(prisma);
      const senderProfile = await createSenderProfile(prisma, freelancer.id);
      const bankAccount = await createBankAccount(prisma, senderProfile.id);
      const customer = await createCustomer(prisma, freelancer.id);
      const invoice = await createInvoice(prisma, {
        senderProfile,
        customer,
        bankAccount,
      });

      const pressed = await createConversation(prisma, {
        userId: freelancer.id,
        title: 'Acme invoice',
        startedFrom: 'AI_SECTION',
        messages: [
          { role: 'USER', text: 'Invoice Acme for 20 hours at 50 USD' },
          { role: 'ASSISTANT', text: 'Which customer did you mean?' },
          {
            role: 'USER',
            text: 'Acme Corp (billing@acme.example.test)',
            origin: 'PRESSED',
          },
          { role: 'ASSISTANT', text: 'Here is the draft.' },
        ],
      });
      const offeredReply = pressed.messages.find((m) => m.position === 1)!;
      const plainReply = pressed.messages.find((m) => m.position === 3)!;
      await createChoiceOffer(prisma, {
        userId: freelancer.id,
        conversationId: pressed.id,
        messageId: offeredReply.id,
        kind: 'CUSTOMER',
        options: defaultOfferOptions([customer.id, 'fixture-acme-gmbh']),
        state: 'CHOSEN',
        chosenOptionId: 1,
      });
      await createDraftCard(prisma, {
        userId: freelancer.id,
        conversationId: pressed.id,
        state: 'CREATED',
        invoiceId: invoice.id,
      });

      const dashboard = await createConversation(prisma, {
        userId: freelancer.id,
        title: 'From the dashboard',
        startedFrom: 'DASHBOARD_PROMPT',
        messages: [
          {
            role: 'USER',
            text: 'Invoice Beta for design',
            origin: 'DASHBOARD',
          },
          { role: 'ASSISTANT', text: 'Which currency?' },
        ],
      });
      const openReply = dashboard.messages.find((m) => m.position === 1)!;
      await createChoiceOffer(prisma, {
        userId: freelancer.id,
        conversationId: dashboard.id,
        messageId: openReply.id,
        kind: 'CURRENCY',
        options: [
          { optionId: 1, label: 'USD', ref: { currency: 'USD' } },
          { optionId: 2, label: 'EUR', ref: { currency: 'EUR' } },
        ],
      });
      return { freelancer, customer, invoice, pressed, dashboard, plainReply };
    }

    it('exports 2.3: start points, origins, offers with labels, state and the chosen option (AC-34)', async () => {
      const a = await chatUser();
      const b = await chatUser();
      const result = await account.getAccountExport(
        await actingFreelancerForTest(a.freelancer.id)
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      const data = result.data;
      expect(data.exportVersion).toBe('2.3');
      expect(data.conversations.map((c) => [c.title, c.startedFrom])).toEqual([
        ['Acme invoice', 'AI_SECTION'],
        ['From the dashboard', 'DASHBOARD_PROMPT'],
      ]);

      const [pressed, dashboard] = data.conversations;
      expect(pressed.messages.map((m) => [m.role, m.origin])).toEqual([
        ['user', 'TYPED'],
        ['assistant', null],
        ['user', 'PRESSED'],
        ['assistant', null],
      ]);
      expect(pressed.messages[1].offer).toEqual({
        kind: 'CUSTOMER',
        options: [
          { optionId: 1, label: 'Acme Corp (billing@acme.example.test)' },
          { optionId: 2, label: 'Acme GmbH (no email)' },
        ],
        state: 'CHOSEN',
        chosenOptionId: 1,
        createdAt: expect.any(String),
      });
      // A reply without an offer and every USER message carry offer: null.
      expect(
        pressed.messages.filter((_, i) => i !== 1).map((m) => m.offer)
      ).toEqual([null, null, null]);

      expect(dashboard.messages[0].origin).toBe('DASHBOARD');
      expect(dashboard.messages[1].offer).toMatchObject({
        kind: 'CURRENCY',
        state: 'OPEN',
        chosenOptionId: null,
      });

      // Invoices carry issuedFromChat; never assistantKeyId.
      expect(data.invoices[0]).toHaveProperty('issuedFromChat');
      expect(data.invoices[0]).not.toHaveProperty('assistantKeyId');

      // Offers never export their record references or the stored draft request; only A's rows.
      const conversationText = JSON.stringify(data.conversations);
      expect(conversationText).not.toContain(a.customer.id);
      expect(conversationText).not.toContain('"ref"');
      expect(conversationText).not.toContain('"request"');
      const text = JSON.stringify(data);
      expect(text).not.toContain(b.freelancer.id);
      expect(text).not.toContain(b.customer.id);

      await assertMatchesContract({
        operationId: 'exportUserData',
        status: 200,
        body: JSON.parse(text),
        specPath: SECURITY_PATCH_SPEC_PATH,
      });
    });

    it('deleteAccount leaves no ChoiceOffer, message or Conversation row; another account is untouched (AC-34)', async () => {
      const a = await chatUser();
      const b = await chatUser();

      const result = await account.deleteAccount(
        await actingFreelancerForTest(a.freelancer.id)
      );

      expect(result.success).toBe(true);
      const where = { userId: a.freelancer.id };
      expect(await prisma.choiceOffer.count({ where })).toBe(0);
      expect(await prisma.conversation.count({ where })).toBe(0);
      expect(
        await prisma.conversationMessage.count({
          where: { conversation: where },
        })
      ).toBe(0);
      expect(await prisma.draftCard.count({ where })).toBe(0);
      expect(
        await prisma.choiceOffer.count({ where: { userId: b.freelancer.id } })
      ).toBe(2);
      expect(
        await prisma.conversation.count({ where: { userId: b.freelancer.id } })
      ).toBe(2);
    });

    it('deleting one Conversation drops its offers and keeps the invoice it created (AC-34)', async () => {
      const a = await chatUser();

      const result = await conversations.deleteConversation(
        await actingFreelancerForTest(a.freelancer.id),
        a.pressed.id
      );

      expect(result.success).toBe(true);
      expect(
        await prisma.choiceOffer.count({
          where: { conversationId: a.pressed.id },
        })
      ).toBe(0);
      expect(
        await prisma.choiceOffer.count({
          where: { conversationId: a.dashboard.id },
        })
      ).toBe(1);
      expect(await prisma.invoice.count({ where: { id: a.invoice.id } })).toBe(
        1
      );
    });
  }
);
