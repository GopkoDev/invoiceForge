// Fix 2026-10-12 (chat-reloads-on-send; spec.md §5 AC-35, AC-36): the chat started on /ai stays mounted
// while its address becomes /ai/{id}, so it reads the saved Conversation's Draft cards and invoice-link
// states through loadConversationCards instead of navigating. The read is owner-scoped: another
// Freelancer's id answers exactly like an unknown id.
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
import { createConversation } from '../../support/factories/conversation';
import { createDraftCard } from '../../support/factories/draft-card';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const authMock =
  vi.fn<() => Promise<{ user: { id: string; email: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));

// A stored DraftProposal (the shape getConversation reads); the ids only need to look like ids here.
const PROPOSAL = {
  customer: {
    customerId: 'clx0customer000000000001',
    name: { freelancerText: 'Acme Corp' },
    source: 'REQUEST',
  },
  senderProfile: {
    senderProfileId: 'clx0sender0000000000001',
    name: { freelancerText: 'Main' },
    source: 'DEFAULT',
  },
  bankAccount: {
    bankAccountId: 'clx0bank00000000000001',
    label: 'Test Bank',
    currency: 'USD',
    source: 'DEFAULT',
  },
  currency: 'USD',
  issueDate: { value: '2026-03-15', source: 'DEFAULT' },
  dueDate: { value: '2026-04-14', source: 'DEFAULT' },
  lines: [
    {
      name: 'Consulting',
      productId: null,
      quantity: '20.00',
      unit: 'hour',
      rate: '50.00',
      amount: '1000.00',
      quantitySource: 'REQUEST',
      unitSource: 'DEFAULT',
      rateSource: 'REQUEST',
    },
  ],
  subtotal: '1000.00',
  total: '1000.00',
  defaultsUsed: [],
};

type Actions = {
  loadConversationCards: (id: string) => Promise<{
    success: boolean;
    code?: string;
    error?: string;
    data?: { cards: Record<string, { id: string }>; invoiceLinks: object };
  }>;
};

describe.runIf(containerRuntimeAvailable)(
  'loadConversationCards (fix 2026-10-12)',
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
    });

    afterEach(async () => {
      await truncateAllTables(prisma);
    });

    async function conversationWithCard(userId: string) {
      const conversation = await createConversation(prisma, { userId });
      const card = await createDraftCard(prisma, {
        userId,
        conversationId: conversation.id,
        proposal: PROPOSAL,
      });
      await prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          position: 0,
          role: 'ASSISTANT',
          parts: [
            { type: 'text', text: 'Here is the draft.' },
            {
              type: 'data-draft-card',
              id: card.id,
              data: { cardId: card.id },
            },
          ],
        },
      });
      return { conversation, card };
    }

    it('returns the cards and link states of the signed-in Freelancer’s Conversation', async () => {
      const user = await createFreelancer(prisma, {
        email: 'fix-cards-a@example.com',
      });
      authMock.mockResolvedValue({ user: { id: user.id, email: user.email } });
      const { conversation, card } = await conversationWithCard(user.id);

      const result = await actions.loadConversationCards(conversation.id);

      expect(result.success).toBe(true);
      expect(Object.keys(result.data!.cards)).toEqual([card.id]);
      expect(result.data!.cards[card.id].id).toBe(card.id);
      expect(result.data!.invoiceLinks).toEqual({});
    });

    it('another Freelancer’s Conversation answers like an unknown one', async () => {
      const owner = await createFreelancer(prisma, {
        email: 'fix-cards-owner@example.com',
      });
      const other = await createFreelancer(prisma, {
        email: 'fix-cards-other@example.com',
      });
      const { conversation } = await conversationWithCard(owner.id);
      authMock.mockResolvedValue({
        user: { id: other.id, email: other.email },
      });

      const foreign = await actions.loadConversationCards(conversation.id);
      const unknown = await actions.loadConversationCards(
        'clx0unknown00000000000001'
      );

      expect(foreign).toEqual({
        success: false,
        code: 'NOT_FOUND',
        error: "This conversation can't be found.",
      });
      expect(unknown).toEqual(foreign);
    });

    it('no session is UNAUTHORIZED', async () => {
      authMock.mockResolvedValue(null);

      const result = await actions.loadConversationCards(
        'clx0unknown00000000000001'
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });
  }
);
