// ai-chat-v2 T78 (sdd:fix 2026-10-14; ADR-0011 amended): an ask_user CUSTOMER question WITHOUT recordIds ends up stored with
// the Freelancer's own Customers as options (not a free-text-only input).
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
import { partsOfText, scriptedModel } from './../support/ai-stub-model';

const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

describe.runIf(containerRuntimeAvailable)('ask_user without recordIds: the server offers the Freelancer\'s records (T78)', () => {
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

  beforeEach(() => authMock.mockReset());
  afterEach(async () => {
    vi.restoreAllMocks();
    await truncateAllTables(prisma);
  });

  async function run(language: 'en' | 'uk', text: string) {
    const user = await createFreelancer(prisma, { email: `t78-${language}@example.com`, timeZone: 'Europe/Kyiv' });
    authMock.mockResolvedValue({ user: { id: user.id } });
    const profile = await createSenderProfile(prisma, user.id, { name: 'Main' });
    await createBankAccount(prisma, profile.id, { currency: 'USD' });
    const other = await createFreelancer(prisma, { email: `t78-other-${language}@example.com` });
    await createCustomer(prisma, other.id, { name: 'Foreign Co' });
    const a = await createCustomer(prisma, user.id, { name: 'Acme', email: 'a@acme.test' });
    const b = await createCustomer(prisma, user.id, { name: 'Beta', email: 'b@beta.test' });
    model = scriptedModel({
      verdict: { topic: 'in_scope', language, intent: 'draft' },
      steps: (i) =>
        i === 0
          ? { toolCall: { name: 'ask_user', input: { questions: [{ field: 'CUSTOMER', prompt: 'Who is it for?' }] } } }
          : { text: 'Pick one.' },
    });
    const res = await POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId: null, message: { id: 'msg_client_01', role: 'user', parts: [{ type: 'text', text }] } }),
      })
    );
    partsOfText(await res.text());
    const forms = await prisma.choiceOffer.findMany();
    expect(forms).toHaveLength(1);
    return { questions: forms[0].questions as any[], ids: [a.id, b.id] };
  }

  it("stores the Freelancer's own Customers as options (never another Freelancer's), keeping the input", async () => {
    const { questions, ids } = await run('en', 'invoice for some work');
    expect(questions[0].options.map((o: any) => o.ref.customerId).sort()).toEqual([...ids].sort());
    expect(questions[0].options.map((o: any) => o.label).sort()).toEqual(['Acme', 'Beta']);
    expect(questions[0].options.find((o: any) => o.label === 'Acme').detail).toBe('a@acme.test');
    expect(questions[0].input).toBe('TEXT');
    expect(questions[0].prompt).toBe('Who is it for?');
    expect('heading' in questions[0]).toBe(false);
  });
});
