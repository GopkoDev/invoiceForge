// ADR-0007: the daily limit-record purge, GET /api/cron/purge-limits, behind the Vercel Cron
// bearer secret. DATABASE_URL is set to the throwaway container before '@/prisma' is imported;
// the cutoff comes from the app clock (`new Date()`), so a faked system time drives it.
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
import {
  createLimitEvent,
  limitKeyDigest,
} from '../../support/factories/limit-event';
import { assertMatchesContract } from '../../support/contract/validate';
import { createConversation } from '../../support/factories/conversation';
import { createDraftCard } from '../../support/factories/draft-card';
import { createAssistantTurn } from '../../support/factories/assistant-turn';
import { createMessageAllowanceDay } from '../../support/factories/message-allowance-day';
import { createPersonalKey } from '../../support/factories/personal-key';
import { createPersonalKeyDraftDay } from '../../support/factories/personal-key-draft-day';
import { PostgresStore } from '@mastra/pg';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const captureCheckIn = vi.fn<(checkIn: { status: string }) => string>(
  () => 'check-in-id'
);
vi.mock('@sentry/nextjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentry/nextjs')>();
  return {
    ...actual,
    captureCheckIn: (c: { status: string }) => captureCheckIn(c),
    captureException: (e: unknown, hint?: unknown) =>
      captureException(e, hint),
  };
});

const captureException = vi.fn<(e: unknown, hint?: unknown) => string>(
  () => 'event-id'
);

const SECRET = 'test-only-cron-secret-0123456789abcdef';
const T0 = new Date('2026-10-02T12:00:00.000Z');
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(T0.getTime() - ms);
// The Freelancer's local day is stored as that day at 00:00 UTC; "today" at the fixed clock.
const TODAY = new Date(Date.UTC(2026, 9, 2));
const daysBefore = (n: number) => new Date(TODAY.getTime() - n * DAY);

type GetHandler = (request: Request) => Promise<Response>;

describe.runIf(containerRuntimeAvailable)(
  'GET /api/cron/purge-limits (T15)',
  () => {
    let db: TestDatabase;
    let factoryPrisma: PrismaClient;
    let appPrisma: PrismaClient;
    let GET: GetHandler;
    let mastraStore: PostgresStore;

    beforeAll(async () => {
      db = await startTestDatabase();
      process.env.DATABASE_URL = db.connectionString;
      process.env.CRON_SECRET = SECRET;
      vi.resetModules();
      factoryPrisma = createTestPrismaClient(db.connectionString);
      ({ prisma: appPrisma } = (await import('@/prisma')) as {
        prisma: PrismaClient;
      });
      mastraStore = new PostgresStore({
        id: 'purge-test-seed',
        connectionString: db.connectionString,
        schemaName: 'mastra',
        disableInit: true,
      });
      ({ GET } = (await import('@/app/api/cron/purge-limits/route')) as {
        GET: GetHandler;
      });
    }, 60_000);

    afterAll(async () => {
      await factoryPrisma?.$disconnect();
      await appPrisma?.$disconnect();
      await db?.stop();
    });

    beforeEach(() => {
      captureCheckIn.mockClear();
      captureException.mockClear();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(T0);
    });

    afterEach(async () => {
      vi.useRealTimers();
      vi.restoreAllMocks();
      await factoryPrisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS purge_test_fail ON "McpDraftRepeat"'
      );
      await truncateAllTables(factoryPrisma);
      await factoryPrisma.$executeRawUnsafe(
        'TRUNCATE TABLE mastra.mastra_ai_spans'
      );
    });

    const call = (headers?: Record<string, string>) =>
      GET(new Request('http://localhost/api/cron/purge-limits', { headers }));
    const authed = () => call({ authorization: `Bearer ${SECRET}` });

    async function seedMixed() {
      const user = await createFreelancer(factoryPrisma);
      const old = new Date(T0.getTime() - 25 * HOUR);
      const young = new Date(T0.getTime() - 23 * HOUR);
      await createLimitEvent(factoryPrisma, {
        scope: 'SIGNIN_SOURCE',
        key: limitKeyDigest('a'),
        at: old,
      });
      await createLimitEvent(factoryPrisma, {
        scope: 'SIGNIN_ADDRESS',
        key: limitKeyDigest('b'),
        outcome: 'SENT',
        at: old,
      });
      await createLimitEvent(factoryPrisma, {
        scope: 'EXPORT',
        userId: user.id,
        outcome: 'STARTED',
        at: old,
      });
      await createLimitEvent(factoryPrisma, {
        scope: 'SIGNIN_SOURCE',
        key: limitKeyDigest('a'),
        at: young,
      });
      await createLimitEvent(factoryPrisma, {
        scope: 'SIGNIN_ADDRESS',
        key: limitKeyDigest('c'),
        outcome: 'SENT',
        at: young,
      });
    }

    it('deletes rows older than 24 h of every scope and key, keeps younger ones, counts exactly', async () => {
      await seedMixed();

      const res = await authed();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toMatchObject({ success: true, data: { deleted: 3 } });
      await assertMatchesContract({
        operationId: 'purgeLimitRecords',
        status: 200,
        body,
      });
      expect(await factoryPrisma.limitEvent.count()).toBe(2);
      expect(
        await factoryPrisma.limitEvent.count({
          where: { at: { lt: new Date(T0.getTime() - 24 * HOUR) } },
        })
      ).toBe(0);
    });

    // The response body still counts limit rows only.
    it('also deletes expired VerificationToken rows and keeps unexpired ones', async () => {
      await factoryPrisma.verificationToken.createMany({
        data: [
          {
            identifier: 'a@example.test',
            token: 'expired-1',
            expires: new Date(T0.getTime() - HOUR),
          },
          {
            identifier: 'b@example.test',
            token: 'expired-2',
            expires: new Date(T0.getTime() - 1),
          },
          {
            identifier: 'c@example.test',
            token: 'live',
            expires: new Date(T0.getTime() + HOUR),
          },
        ],
      });

      const res = await authed();

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        success: true,
        data: { deleted: 0 },
      });
      const left = await factoryPrisma.verificationToken.findMany();
      expect(left.map((t) => t.token)).toEqual(['live']);
    });

    it('is idempotent: a second run the same day deletes nothing', async () => {
      await seedMixed();
      await authed();

      const second = await (await authed()).json();

      expect(second).toMatchObject({ success: true, data: { deleted: 0 } });
      expect(await factoryPrisma.limitEvent.count()).toBe(2);
    });

    it('sends Sentry Crons check-ins in_progress then ok', async () => {
      await authed();

      expect(captureCheckIn.mock.calls.map(([c]) => c.status)).toEqual([
        'in_progress',
        'ok',
      ]);
    });

    it.each([
      ['no Authorization header', undefined],
      ['a wrong secret', { authorization: 'Bearer wrong-secret' }],
      ['a secret of a different length', { authorization: 'Bearer x' }],
      ['the secret without the Bearer scheme', { authorization: SECRET }],
    ])(
      'refuses %s with 401 UNAUTHORIZED and deletes nothing',
      async (_name, headers) => {
        await seedMixed();

        const res = await call(headers);
        const body = await res.json();

        expect(res.status).toBe(401);
        expect(body).toEqual({
          success: false,
          code: 'UNAUTHORIZED',
          error: 'Not authorized.',
        });
        await assertMatchesContract({
          operationId: 'purgeLimitRecords',
          status: 401,
          body,
        });
        expect(await factoryPrisma.limitEvent.count()).toBe(5);
      }
    );

    it('answers 500 FAILED and sends an error check-in when the delete fails', async () => {
      await seedMixed();
      vi.spyOn(appPrisma, '$executeRaw').mockRejectedValue(
        new Error('connection lost')
      );

      const res = await authed();
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body).toEqual({
        success: false,
        code: 'FAILED',
        error: 'Purge failed.',
      });
      await assertMatchesContract({
        operationId: 'purgeLimitRecords',
        status: 500,
        body,
      });
      expect(JSON.stringify(body)).not.toContain('connection lost');
      expect(captureCheckIn.mock.calls.map(([c]) => c.status)).toEqual([
        'in_progress',
        'error',
      ]);
    });

    // ---- ai-assistant T14 (AC-38): four independent AI retention steps ----

    async function seedSpan(traceId: string, startedAt: Date) {
      const obs = await mastraStore.getStore('observability');
      await obs!.createSpan({
        span: {
          traceId,
          spanId: `${traceId}-root`,
          name: 'agent run',
          spanType: 'agent_run' as never,
          isEvent: false,
          startedAt,
          endedAt: new Date(startedAt.getTime() + 1000),
        },
      });
    }
    const traceIds = async () =>
      (
        await factoryPrisma.$queryRawUnsafe<{ traceId: string }[]>(
          'SELECT DISTINCT "traceId" FROM mastra.mastra_ai_spans'
        )
      )
        .map((r) => r.traceId)
        .sort();

    async function seedAi() {
      const user = await createFreelancer(factoryPrisma);
      const { row: key } = await createPersonalKey(factoryPrisma, user.id);
      const msgs = [
        { role: 'USER' as const, text: 'hello' },
        { role: 'ASSISTANT' as const, text: 'hi' },
      ];
      const oldConv = await createConversation(factoryPrisma, {
        userId: user.id,
        lastMessageAt: ago(90 * DAY + HOUR),
        messages: msgs,
      });
      const youngConv = await createConversation(factoryPrisma, {
        userId: user.id,
        lastMessageAt: ago(89 * DAY),
        messages: msgs,
      });
      await createDraftCard(factoryPrisma, {
        userId: user.id,
        conversationId: oldConv.id,
      });
      await createDraftCard(factoryPrisma, {
        userId: user.id,
        conversationId: youngConv.id,
      });
      // Repeat marks: 25 h goes, 23 h stays.
      for (const [repeatKey, at] of [
        ['old', ago(25 * HOUR)],
        ['young', ago(23 * HOUR)],
      ] as const) {
        await factoryPrisma.mcpDraftRepeat.create({
          data: {
            personalKeyId: key.id,
            repeatKey,
            fingerprint: 'f'.repeat(64),
            createdAt: at,
          },
        });
      }
      await seedSpan('trace-old', ago(30 * DAY + HOUR));
      await seedSpan('trace-young', ago(29 * DAY));
      // A young turn pointing at the old Conversation must survive it, unlinked.
      await createAssistantTurn(factoryPrisma, {
        userId: user.id,
        conversationId: oldConv.id,
        createdAt: ago(DAY),
      });
      await createAssistantTurn(factoryPrisma, {
        userId: user.id,
        createdAt: ago(401 * DAY),
      });
      await createAssistantTurn(factoryPrisma, {
        userId: user.id,
        createdAt: ago(399 * DAY),
      });
      await createMessageAllowanceDay(factoryPrisma, {
        userId: user.id,
        day: daysBefore(401),
      });
      await createMessageAllowanceDay(factoryPrisma, {
        userId: user.id,
        day: daysBefore(399),
      });
      await createPersonalKeyDraftDay(factoryPrisma, {
        personalKeyId: key.id,
        day: daysBefore(401),
      });
      await createPersonalKeyDraftDay(factoryPrisma, {
        personalKeyId: key.id,
        day: daysBefore(399),
      });
      return { user, oldConv, youngConv };
    }

    const counts = async () => ({
      conversations: await factoryPrisma.conversation.count(),
      messages: await factoryPrisma.conversationMessage.count(),
      cards: await factoryPrisma.draftCard.count(),
      repeats: await factoryPrisma.mcpDraftRepeat.count(),
      turns: await factoryPrisma.assistantTurn.count(),
      allowance: await factoryPrisma.messageAllowanceDay.count(),
      keyDays: await factoryPrisma.personalKeyDraftDay.count(),
      traces: (await traceIds()).length,
    });

    it('AC-38: one run deletes exactly what is past each retention window and keeps the rest', async () => {
      const { youngConv } = await seedAi();

      const res = await authed();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(await counts()).toEqual({
        conversations: 1,
        messages: 2,
        cards: 1,
        repeats: 1,
        turns: 2, // the 401-day turn went; the young one survived its Conversation
        allowance: 1,
        keyDays: 1,
        traces: 1,
      });
      expect(
        (await factoryPrisma.conversation.findMany()).map((c) => c.id)
      ).toEqual([youngConv.id]);
      expect(
        (await factoryPrisma.mcpDraftRepeat.findMany()).map((r) => r.repeatKey)
      ).toEqual(['young']);
      expect(await traceIds()).toEqual(['trace-young']);
      const young = await factoryPrisma.assistantTurn.findMany({
        where: { createdAt: { gt: ago(2 * DAY) } },
      });
      expect(young).toHaveLength(1);
      expect(young[0].conversationId).toBeNull();
      // Limit-record count and per-step report.
      expect(body.data).toHaveProperty('deleted');
      const steps = body.data.steps as {
        step: string;
        deleted: number | null;
        ok: boolean;
      }[];
      const byStep = Object.fromEntries(steps.map((s) => [s.step, s]));
      expect(Object.keys(byStep).sort()).toEqual([
        'conversations',
        'repeatMarks',
        'traces',
        'turnsAndCounters',
      ]);
      expect(byStep.conversations).toEqual({
        step: 'conversations',
        deleted: 1,
        ok: true,
      });
      expect(byStep.repeatMarks).toEqual({
        step: 'repeatMarks',
        deleted: 1,
        ok: true,
      });
      expect(byStep.traces.ok).toBe(true);
      expect(byStep.turnsAndCounters).toEqual({
        step: 'turnsAndCounters',
        deleted: 3, // one turn + one allowance day + one key-draft day
        ok: true,
      });
      expect(captureCheckIn.mock.calls.map(([c]) => c.status)).toEqual([
        'in_progress',
        'ok',
      ]);
    });

    it('a second run the same day deletes nothing new', async () => {
      await seedAi();
      await authed();
      const before = await counts();

      const body = await (await authed()).json();

      expect(await counts()).toEqual(before);
      for (const s of body.data.steps as { deleted: number | null }[]) {
        expect(s.deleted ?? 0).toBe(0);
      }
    });

    it('one failing step is reported to Sentry by name and never skips the others', async () => {
      await seedAi();
      await factoryPrisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION purge_test_fail() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'forced repeat-mark failure'; END;
        $$ LANGUAGE plpgsql`);
      await factoryPrisma.$executeRawUnsafe(
        `CREATE TRIGGER purge_test_fail BEFORE DELETE ON "McpDraftRepeat"
         FOR EACH ROW EXECUTE FUNCTION purge_test_fail()`
      );

      const res = await authed();
      const body = await res.json();

      const c = await counts();
      expect(c.conversations).toBe(1);
      expect(c.turns).toBe(2);
      expect(c.allowance).toBe(1);
      expect(c.keyDays).toBe(1);
      expect(c.traces).toBe(1);
      expect(c.repeats).toBe(2); // the failed step deleted nothing
      const steps = body.data.steps as { step: string; ok: boolean }[];
      expect(steps.find((s) => s.step === 'repeatMarks')?.ok).toBe(false);
      expect(steps.filter((s) => s.ok)).toHaveLength(3);
      expect(captureException).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(captureException.mock.calls[0])).toContain(
        'repeatMarks'
      );
      expect(captureCheckIn.mock.calls.map(([c2]) => c2.status)).toEqual([
        'in_progress',
        'error',
      ]);
    });

    it('with a wrong secret the AI rows are not deleted either', async () => {
      await seedAi();
      const before = await counts();

      const res = await call({ authorization: 'Bearer wrong-secret' });

      expect(res.status).toBe(401);
      expect(await counts()).toEqual(before);
    });
  }
);
