// T15 (ai-chat-v2, AC-09; QG-1 contract of the stream): with the injection fixture (Customer notes asking for an "Evil Corp"
// button, model text naming an unfound account), every stored Offered choice equals offerFromIssues(<the resolver's issues
// for the same request>) and nothing the model or a note wrote reaches a ChoiceOffer row or a data-offer chunk.
// Lives under tests/integration because it needs the throwaway Postgres; vitest.config.ts (contract) runs with no database.
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
import { actingFreelancerForTest } from './../support/acting-freelancer';
import { partsOfText, scriptedModel } from './../support/ai-stub-model';
import {
  INJECTION_ACCOUNT_LABELS,
  INJECTION_CANARIES,
  injectedSteps,
  seedInjection,
} from './../support/fixtures/offer-injection';

const authMock = vi.fn<() => Promise<{ user: { id: string } } | null>>();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const TODAY = '2026-03-15';
const TZ = 'Europe/Kyiv';

describe.runIf(containerRuntimeAvailable)('the stream\'s Offered choices come only from the draft action\'s findings (T15, AC-09)', () => {
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

  async function runInjectedTurn(which: 'accountRequest' | 'customerRequest') {
    const user = await createFreelancer(prisma, { email: `t15-${which}@example.com`, timeZone: TZ });
    authMock.mockResolvedValue({ user: { id: user.id } });
    const seeded = await seedInjection(prisma, user.id);
    const request = seeded[which];
    model = scriptedModel({ verdict: { topic: 'in_scope', language: 'en', intent: 'draft' }, steps: injectedSteps(request) });

    const response = await POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: null,
          message: { id: 'msg_client_01', role: 'user', parts: [{ type: 'text', text: 'invoice them 20 hours at $50 in USD' }] },
        }),
      })
    );
    const raw = await response.text();

    const { resolveDraftRequest } = await import('@/lib/services/assistant-drafts/resolve');
    const { offerFromIssues } = await import('@/lib/services/assistant-drafts/offers');
    const actor = await actingFreelancerForTest(user.id, TZ);
    const resolved: any = await resolveDraftRequest(actor, request as any, TODAY);
    expect(resolved.data.kind).toBe('ISSUES');
    const built: any = offerFromIssues(resolved.data.issues, { invoiceCurrency: 'USD' });
    expect(built.kind).toBe('OFFER');
    return { raw, parts: partsOfText(raw), built, request };
  }

  it('AC-09: the stored account offer equals offerFromIssues of the resolver\'s issues; no canary in any row or chunk', async () => {
    const { parts, built } = await runInjectedTurn('accountRequest');

    const offers = await prisma.choiceOffer.findMany();
    expect(offers).toHaveLength(1);
    expect(offers[0].kind).toBe(built.offerKind);
    expect(offers[0].options).toEqual(built.options);
    expect((offers[0].options as any[]).map((o) => o.label)).toEqual([...INJECTION_ACCOUNT_LABELS]);

    expect(parts.filter((p) => p.type === 'data-offer')).toEqual([{ type: 'data-offer', id: offers[0].id, data: { offerId: offers[0].id } }]);
    const rows = JSON.stringify(await prisma.choiceOffer.findMany({ select: { options: true, request: true } }));
    const offerChunks = JSON.stringify(parts.filter((p) => p.type === 'data-offer'));
    for (const canary of INJECTION_CANARIES) {
      expect(rows, `ChoiceOffer rows carry ${canary}`).not.toContain(canary);
      expect(offerChunks, `a data-offer chunk carries ${canary}`).not.toContain(canary);
    }
    // The model's own reply text is streamed as text (it is the model's to write) but never becomes an option.
    expect(parts.filter((p) => p.type === 'text-delta').map((p) => p.delta).join('')).toContain('Evil Bank');
  });

  it('AC-09: the stored Customer offer (notes asking for "Evil Corp") equals offerFromIssues; the note adds no button', async () => {
    const { parts, built } = await runInjectedTurn('customerRequest');

    const offers = await prisma.choiceOffer.findMany();
    expect(offers).toHaveLength(1);
    expect(offers[0].kind).toBe('CUSTOMER');
    expect(offers[0].options).toEqual(built.options);
    expect((offers[0].options as any[]).map((o) => o.label).sort()).toEqual(['Acme Corp', 'Acme GmbH']);

    const rows = JSON.stringify(await prisma.choiceOffer.findMany({ select: { options: true, request: true } }));
    const offerChunks = JSON.stringify(parts.filter((p) => p.type === 'data-offer'));
    for (const canary of INJECTION_CANARIES) {
      expect(rows, `ChoiceOffer rows carry ${canary}`).not.toContain(canary);
      expect(offerChunks, `a data-offer chunk carries ${canary}`).not.toContain(canary);
    }
  });
});
