// T34 (ai-assistant, AC-11; spec §6 "Model provider outage"; sad §10 QG-3, §11 risk 3): provider faults
// through POST /api/chat. A provider that errors, rate-limits, times out, fails mid-stream or never answers
// ends the turn with AI_UNAVAILABLE within 10 s, gives the slot back, saves only metadata (no Conversation,
// no message) and leaks no provider detail to the client. The model is a scripted stub; no network.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { APICallError } from 'ai';
import type { MockLanguageModelV4 } from 'ai/test';
import type { PrismaClient } from '@prisma/client';
import { isContainerRuntimeAvailable } from '../../support/db/docker-availability';
import { startTestDatabase, type TestDatabase } from '../../support/db/container';
import { createTestPrismaClient } from '../../support/db/client';
import { truncateAllTables } from '../../support/db/truncate';
import { createFreelancer } from '../../support/factories/user';
import { createMessageAllowanceDay } from '../../support/factories/message-allowance-day';
import { partsOfText, scriptedModel, type StubStep } from '../../support/ai-stub-model';

const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TZ = 'Europe/Kyiv';
const DEADLINE_MS = 10_000;
const SECRET = 'sk-live-SECRET-provider-detail-7f3a';
const QUESTION = 'Who owes me money this week?';

const localToday = () => new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())}T00:00:00.000Z`);

const apiError = (statusCode: number, retryable: boolean) =>
  new APICallError({
    message: `provider said ${statusCode} ${SECRET}`,
    url: 'https://provider.invalid/v1/chat',
    requestBodyValues: {},
    statusCode,
    responseBody: SECRET,
    isRetryable: retryable,
  });

const faults: [string, StubStep][] = [
  ['a thrown provider error', { error: new Error(`upstream down ${SECRET}`) }],
  ['a 429 rate limit', { error: apiError(429, true) }],
  ['a 500 server error', { error: apiError(500, true) }],
  ['a 503 outage', { error: apiError(503, true) }],
  ['a provider timeout', { error: Object.assign(new Error(`timed out ${SECRET}`), { name: 'TimeoutError' }) }],
  ['an error in the middle of the stream', { text: 'Partial answer that must not be kept. ', streamError: new Error(`stream broke ${SECRET}`) }],
];

describe.runIf(containerRuntimeAvailable)('POST /api/chat provider faults (T34)', () => {
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
    model = scriptedModel({ steps: () => ({ text: 'Here is your answer.' }) });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await truncateAllTables(prisma);
  });

  async function signedIn(used = 12) {
    const user = await createFreelancer(prisma, { email: 't34-faults@example.com', timeZone: TZ });
    authMock.mockResolvedValue({ user: { id: user.id } });
    await createMessageAllowanceDay(prisma, { userId: user.id, day: localToday(), used, timeZone: TZ });
    return user;
  }

  const send = (text: string) =>
    POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: null,
          message: { id: 'msg_client_01', role: 'user', parts: [{ type: 'text', text }] },
        }),
      })
    );

  const usedToday = async (userId: string) => (await prisma.messageAllowanceDay.findFirst({ where: { userId } }))?.used ?? 0;

  /** Reads the whole response, failing (instead of hanging the suite) when it takes longer than the 10 s target. */
  async function readWithin(response: Response, ms: number): Promise<{ text: string; elapsedMs: number }> {
    const started = Date.now();
    const text = await Promise.race([
      response.text(),
      new Promise<string>((resolve) => setTimeout(() => resolve('__TIMED_OUT__'), ms)),
    ]);
    return { text, elapsedMs: Date.now() - started };
  }

  async function expectCostNothing(userId: string, usedBefore: number, startedAt: number, responseText: string) {
    const parts = partsOfText(responseText);
    const types = parts.map((p) => p.type);
    const outcome = parts.findLast((p) => p.type === 'data-outcome');
    expect(outcome?.data).toEqual({ outcome: 'AI_UNAVAILABLE', counted: false });
    const lastAllowance = parts.findLast((p) => p.type === 'data-allowance');
    expect(lastAllowance.data).toMatchObject({ used: usedBefore, left: 30 - usedBefore });
    expect(types.lastIndexOf('data-allowance')).toBeGreaterThan(types.indexOf('data-outcome'));
    // The client never sees provider detail.
    expect(responseText).not.toContain(SECRET);
    expect(await usedToday(userId)).toBe(usedBefore);

    await vi.waitFor(async () => expect(await prisma.assistantTurn.count()).toBe(1));
    const turn = await prisma.assistantTurn.findFirstOrThrow();
    expect(turn).toMatchObject({ outcome: 'FAILED', counted: false, conversationId: null });
    expect(turn.durationMs).toBeLessThan(Date.now() - startedAt + 1000);
    // Metadata only: no question, no reply, no provider text in the stored row.
    const stored = JSON.stringify(turn);
    expect(stored).not.toContain(QUESTION);
    expect(stored).not.toContain(SECRET);
    // Nothing half-saved.
    expect(await prisma.conversation.count()).toBe(0);
    expect(await prisma.conversationMessage.count()).toBe(0);
    expect(await prisma.draftCard.count()).toBe(0);
    expect(await prisma.invoice.count()).toBe(0);
  }

  it.each(faults)('AC-11: %s ends AI_UNAVAILABLE within 10 s, releases the slot and saves only metadata', async (_label, step) => {
    model = scriptedModel({ steps: () => step });
    const user = await signedIn();
    const startedAt = Date.now();

    const response = await send(QUESTION);
    const { text, elapsedMs } = await readWithin(response, DEADLINE_MS + 5_000);

    expect(response.status).toBe(200);
    expect(text, 'the turn did not end in time').not.toBe('__TIMED_OUT__');
    expect(elapsedMs).toBeLessThan(DEADLINE_MS);
    await expectCostNothing(user.id, 12, startedAt, text);
  }, 30_000);

  it('AC-11: a provider that fails after the router succeeded is still AI_UNAVAILABLE and the Freelancer can send again', async () => {
    let providerDown = true;
    model = scriptedModel({ steps: () => (providerDown ? { error: apiError(429, true) } : { text: 'Back again.' }) });
    const user = await signedIn(29);

    const first = await readWithin(await send(QUESTION), DEADLINE_MS + 5_000);
    expect(first.text).not.toBe('__TIMED_OUT__');
    expect(partsOfText(first.text).findLast((p) => p.type === 'data-outcome').data).toEqual({
      outcome: 'AI_UNAVAILABLE',
      counted: false,
    });
    expect(await usedToday(user.id)).toBe(29);
    providerDown = false;

    // The last slot was given back, so the next message is processed and counted, not refused.
    const second = await send('Try again please');
    expect(second.status).toBe(200);
    const parts = partsOfText(await second.text());
    expect(parts.findLast((p) => p.type === 'data-outcome').data).toEqual({ outcome: 'ANSWERED', counted: true });
    expect(await usedToday(user.id)).toBe(30);
  }, 40_000);

  // R-05: the topic router calls the same provider first; a fault there is the same outage, not a system failure.
  const routerFaults = faults.filter((f): f is [string, { error: Error }] => 'error' in f[1]);

  it.each(routerFaults)('AC-11: %s at the topic router ends AI_UNAVAILABLE within 10 s, releases the slot and saves only metadata', async (_label, step) => {
    model = scriptedModel({ verdict: step.error, steps: () => ({ text: 'must not run' }) });
    const user = await signedIn();
    const startedAt = Date.now();

    const response = await send(QUESTION);
    const { text, elapsedMs } = await readWithin(response, DEADLINE_MS + 5_000);

    expect(response.status).toBe(200);
    expect(text, 'the turn did not end in time').not.toBe('__TIMED_OUT__');
    expect(elapsedMs).toBeLessThan(DEADLINE_MS);
    expect(model.doStreamCalls).toHaveLength(0);
    await expectCostNothing(user.id, 12, startedAt, text);
  }, 30_000);

  // A provider that never answers is not covered: the owner decided on no turn deadlines in the chat
  // route (sad.md §1 decision override, §7, §11 accepted debt), so a hang holds the stream on the
  // platform's default duration.
});
