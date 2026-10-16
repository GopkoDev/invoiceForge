// T25 (ai-assistant; spec.md §5 AC-37; sad.md §6 Flow 8) - deleting one or all Conversations is owner-scoped:
// messages and Draft cards go with them, AssistantTurn metadata stays unlinked, every invoice is unchanged, another
// Freelancer's id answers exactly like an unknown id, and the server actions revalidate /ai.
// Expected production module: lib/actions/assistant-actions.ts exporting
//   deleteConversation(id: string) -> ActionResult<void>
//   deleteAllConversations() -> ActionResult<{ deleted: number }>
// backed by lib/services/conversations/delete.ts.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createCustomer } from '../../support/factories/customer';
import { createSenderProfile } from '../../support/factories/sender-profile';
import { createBankAccount } from '../../support/factories/bank-account';
import { createInvoice } from '../../support/factories/invoice';
import { createConversation } from '../../support/factories/conversation';
import { createDraftCard } from '../../support/factories/draft-card';
import { createAssistantTurn } from '../../support/factories/assistant-turn';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const authMock =
  vi.fn<() => Promise<{ user: { id: string; email: string } } | null>>();
const revalidateMock = vi.fn<(path: string) => void>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidateMock(p),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const NOT_FOUND = {
  success: false,
  code: 'NOT_FOUND',
  error: "This conversation can't be found.",
};

type Actions = {
  deleteConversation: (id: string) => Promise<unknown>;
  deleteAllConversations: () => Promise<unknown>;
};

describe.runIf(containerRuntimeAvailable)(
  'Deleting Conversations (T25, AC-37)',
  () => {
    let db: TestDatabase;
    let prisma: PrismaClient;
    let actions: Actions;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      vi.resetModules();
      prisma = createTestPrismaClient(db.connectionString);
      actions =
        (await import('@/lib/actions/assistant-actions')) as unknown as Actions;
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect();
      await db?.stop();
    });

    beforeEach(() => {
      authMock.mockReset();
      revalidateMock.mockReset();
    });

    afterEach(async () => {
      await truncateAllTables(prisma);
    });

    async function seed() {
      const user = await createFreelancer(prisma, {
        email: 't25-a@example.com',
        timeZone: 'Europe/Kyiv',
      });
      authMock.mockResolvedValue({ user: { id: user.id, email: user.email } });
      const senderProfile = await createSenderProfile(prisma, user.id);
      const customer = await createCustomer(prisma, user.id);
      const bankAccount = await createBankAccount(prisma, senderProfile.id);
      const invoice = await createInvoice(prisma, {
        senderProfile,
        customer,
        bankAccount,
        overrides: { status: 'DRAFT' },
      });
      const mine = await createConversation(prisma, {
        userId: user.id,
        messages: [{ role: 'USER' }, { role: 'ASSISTANT' }],
      });
      const other = await createConversation(prisma, {
        userId: user.id,
        messages: [{ role: 'USER' }],
      });
      const card = await createDraftCard(prisma, {
        userId: user.id,
        conversationId: mine.id,
        state: 'CREATED',
        invoiceId: invoice.id,
      });
      const turn = await createAssistantTurn(prisma, {
        userId: user.id,
        conversationId: mine.id,
      });
      return { user, invoice, mine, other, card, turn };
    }

    it('AC-37: deleting one Conversation removes it with messages and cards, detaches its turns, keeps the invoice and revalidates /ai', async () => {
      const { invoice, mine, other, card, turn } = await seed();
      const before = await prisma.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
      });

      const result = await actions.deleteConversation(mine.id);

      expect(result).toEqual({ success: true, data: undefined });
      expect(
        await prisma.conversation.findUnique({ where: { id: mine.id } })
      ).toBeNull();
      expect(
        await prisma.conversationMessage.count({
          where: { conversationId: mine.id },
        })
      ).toBe(0);
      expect(
        await prisma.draftCard.findUnique({ where: { id: card.id } })
      ).toBeNull();
      const detached = await prisma.assistantTurn.findUniqueOrThrow({
        where: { id: turn.id },
      });
      expect(detached.conversationId).toBeNull();
      expect(
        await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
      ).toEqual(before);
      expect(
        await prisma.conversation.findUnique({ where: { id: other.id } })
      ).not.toBeNull();
      expect(revalidateMock).toHaveBeenCalledWith('/ai');
    });

    it("AC-37: another Freelancer's Conversation answers exactly like an unknown id and is not deleted", async () => {
      await seed();
      const stranger = await createFreelancer(prisma, {
        email: 't25-b@example.com',
      });
      const foreign = await createConversation(prisma, {
        userId: stranger.id,
        messages: [{ role: 'USER' }],
      });

      const foreignResult = await actions.deleteConversation(foreign.id);
      const unknownResult =
        await actions.deleteConversation('cnv_does_not_exist');

      expect(foreignResult).toEqual(NOT_FOUND);
      expect(unknownResult).toEqual(NOT_FOUND);
      expect(
        await prisma.conversation.findUnique({ where: { id: foreign.id } })
      ).not.toBeNull();
      expect(
        await prisma.conversationMessage.count({
          where: { conversationId: foreign.id },
        })
      ).toBe(1);
    });

    it("AC-37: deleting all removes only this Freelancer's Conversations, returns the count and keeps every invoice", async () => {
      const { invoice } = await seed();
      const stranger = await createFreelancer(prisma, {
        email: 't25-b@example.com',
      });
      const foreign = await createConversation(prisma, {
        userId: stranger.id,
        messages: [{ role: 'USER' }],
      });
      const before = await prisma.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
      });

      const result = await actions.deleteAllConversations();

      expect(result).toEqual({ success: true, data: { deleted: 2 } });
      expect(await prisma.conversation.count()).toBe(1);
      expect(
        await prisma.conversation.findUnique({ where: { id: foreign.id } })
      ).not.toBeNull();
      expect(await prisma.conversationMessage.count()).toBe(1);
      expect(await prisma.draftCard.count()).toBe(0);
      expect(
        await prisma.assistantTurn.count({
          where: { conversationId: { not: null } },
        })
      ).toBe(0);
      expect(await prisma.assistantTurn.count()).toBe(1);
      expect(
        await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
      ).toEqual(before);
      expect(revalidateMock).toHaveBeenCalledWith('/ai');
    });

    it('AC-37: deleting all with no Conversations answers ok with deleted 0', async () => {
      const user = await createFreelancer(prisma, {
        email: 't25-c@example.com',
      });
      authMock.mockResolvedValue({ user: { id: user.id, email: user.email } });

      const result = await actions.deleteAllConversations();

      expect(result).toEqual({ success: true, data: { deleted: 0 } });
    });

    it('AC-37: without a session nothing is deleted', async () => {
      const { mine } = await seed();
      authMock.mockResolvedValue(null);

      const one = (await actions.deleteConversation(mine.id)) as {
        success: boolean;
      };
      const all = (await actions.deleteAllConversations()) as {
        success: boolean;
      };

      expect(one.success).toBe(false);
      expect(all.success).toBe(false);
      expect(await prisma.conversation.count()).toBe(2);
    });
  }
);
