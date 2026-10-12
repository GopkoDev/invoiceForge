// T01 (ai-chat-v2, AC-10; ADR-0003; sad §11 spike): a chat turn started from a pinned resolution. The press
// path resolves the chosen record in code; runTurn then carries that result into the model's input as a prior
// propose_draft step, and the pending card is the pinned proposal - never a second match by name.
// The model is the scripted stand-in; the real model and network are never used.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { APICallError } from 'ai';
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
import { scriptedModel, type StubStep } from './../support/ai-stub-model';

let model: MockLanguageModelV4;
vi.mock('@/lib/ai/model', () => ({ getChatModel: () => model }));

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const TODAY = '2026-03-15';
const TZ = 'Europe/Kyiv';
const LOOK_ALIKE = 'Аcme Corp'; // Cyrillic "А"

/** Every tool-result part the model was called with, across the prompt's messages. */
function toolResultsIn(prompt: any): any[] {
  if (!Array.isArray(prompt)) return [];
  return prompt.flatMap((m: any) =>
    Array.isArray(m.content) ? m.content.filter((p: any) => p?.type === 'tool-result') : []
  );
}

/** The whole prompt as text, for "does the model see X" checks that do not depend on the message shape. */
const promptText = (prompt: any) => JSON.stringify(prompt);

describe.runIf(containerRuntimeAvailable)('runTurn from a pinned resolution (T01, AC-10)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    prisma = createTestPrismaClient(db.connectionString);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  async function setup() {
    const user = await createFreelancer(prisma, { email: 't01-pinned@example.com', timeZone: TZ });
    const profile = await createSenderProfile(prisma, user.id, { name: 'Studio' });
    await createBankAccount(prisma, profile.id, { currency: 'USD' });
    const latin = await createCustomer(prisma, user.id, { name: 'Acme Corp', email: 'billing@acme.example.test' });
    const cyrillic = await createCustomer(prisma, user.id, { name: LOOK_ALIKE, email: 'ap@acme-ua.example.test' });
    const actor = await actingFreelancerForTest(user.id, TZ);
    const { runTurn } = await import('@/lib/ai/run-turn');
    const { resolveDraftRequest } = await import('@/lib/services/assistant-drafts/resolve');

    const resolvePinned = async (request: any): Promise<any> => {
      const resolved = await resolveDraftRequest(actor, request, TODAY);
      if (!resolved.success) throw new Error('resolver failed');
      return resolved.data;
    };

    const run = async (message: string, pinned?: { request: any; resolution: any }) => {
      const { stream, result } = await runTurn({
        actor,
        today: TODAY,
        history: [],
        message,
        signal: new AbortController().signal,
        pinned,
      });
      const chunks: any[] = [];
      for await (const chunk of stream) chunks.push(chunk);
      return { chunks, result: await result };
    };
    return { latin, cyrillic, run, resolvePinned };
  }

  function recordingModel(step: (i: number) => StubStep, intent = 'read') {
    const prompts: any[] = [];
    model = scriptedModel({
      verdict: { topic: 'in_scope', language: 'en', intent },
      steps: (i, prompt) => {
        prompts.push(prompt);
        return step(i);
      },
    });
    return prompts;
  }

  it('a pinned PROPOSAL is the pending card and the model input carries it, with no second name match', async () => {
    const { cyrillic, run, resolvePinned } = await setup();
    const request = { customerId: cyrillic.id, currency: 'USD', lines: [{ description: 'Design', quantity: '1', price: '100' }] };
    const resolution = await resolvePinned(request);
    expect(resolution.kind).toBe('PROPOSAL');
    const prompts = recordingModel(() => ({ text: 'Here is the draft for your Customer.' }));

    const { result } = await run(LOOK_ALIKE, { request, resolution });

    expect(result.outcome).toBe('ANSWERED');
    expect(result.pendingCard).toBeDefined();
    expect(result.pendingCard!.proposal).toEqual(resolution.proposal);
    expect(result.pendingCard!.proposal.customer.customerId).toBe(cyrillic.id);
    expect(result.pendingCard!.request).toEqual(request);
    // The model never had to call propose_draft: the pinned result was already in its input.
    expect(result.toolNames).not.toContain('propose_draft');
    expect(prompts).toHaveLength(1);
    const text = promptText(prompts[0]);
    expect(text).toContain(cyrillic.id);
    expect(text).toContain('PROPOSAL');
  });

  it('records the pinned result as a prior propose_draft tool step in the model input (approach A)', async () => {
    const { cyrillic, run, resolvePinned } = await setup();
    const request = { customerId: cyrillic.id, currency: 'USD', lines: [{ description: 'Design', quantity: '1', price: '100' }] };
    const resolution = await resolvePinned(request);
    const prompts = recordingModel(() => ({ text: 'Done.' }));

    await run(LOOK_ALIKE, { request, resolution });

    const results = toolResultsIn(prompts[0]);
    expect(results).toHaveLength(1);
    expect(results[0].toolName).toBe('propose_draft');
    expect(JSON.stringify(results[0])).toContain(cyrillic.id);
  });

  it('a pinned ISSUES resolution parks no card and puts the issues in the model input', async () => {
    const { run, resolvePinned } = await setup();
    // "Acme Corp" folds equal to both look-alike Customers: the resolver asks which one.
    const request = { customer: 'Acme Corp', currency: 'USD', lines: [{ description: 'Design', quantity: '1', price: '100' }] };
    const resolution = await resolvePinned(request);
    expect(resolution.kind).toBe('ISSUES');
    const prompts = recordingModel(() => ({ text: 'Which Customer do you mean?' }));

    const { result } = await run('Acme Corp', { request, resolution });

    expect(result.outcome).toBe('ANSWERED');
    expect(result.pendingCard).toBeUndefined();
    const text = promptText(prompts[0]);
    expect(text).toContain('ISSUES');
    expect(text).toContain(resolution.issues[0].kind);
  });

  it('keeps the pinned card when the model re-calls propose_draft by the ambiguous name, and the turn context holds the pins', async () => {
    const { cyrillic, run, resolvePinned } = await setup();
    const request = { customerId: cyrillic.id, currency: 'USD', lines: [{ description: 'Design', quantity: '1', price: '100' }] };
    const resolution = await resolvePinned(request);
    recordingModel((i) =>
      i === 0
        ? { toolCall: { name: 'propose_draft', input: { customer: 'Acme Corp', currency: 'USD', lines: [{ description: 'Design', quantity: '1', price: '100' }] } } }
        : { text: 'Here it is.' }
    );

    const { result } = await run(LOOK_ALIKE, { request, resolution });

    expect(result.pendingCard?.proposal.customer.customerId).toBe(cyrillic.id);

    // T13's propose_draft adapter re-applies these pins on a re-call; T01 only carries them.
    const { createTurnContext } = await import('@/lib/ai/turn-context');
    const turn = createTurnContext({ actor: {} as any, today: TODAY, pinned: { request, resolution } });
    expect(turn.pins).toEqual(request);
    expect(turn.draftIntent).toBe(true);
    expect(turn.pending.card?.proposal).toEqual(resolution.proposal);
  });

  it('a press is never refused as off-topic: the router reading the label off-topic still runs the pinned turn', async () => {
    const { cyrillic, run, resolvePinned } = await setup();
    const request = { customerId: cyrillic.id, currency: 'USD', lines: [{ description: 'Design', quantity: '1', price: '100' }] };
    const resolution = await resolvePinned(request);
    model = scriptedModel({ verdict: { topic: 'off_topic', language: 'en', intent: 'read' }, steps: () => ({ text: 'Draft ready.' }) });

    const { result } = await run(LOOK_ALIKE, { request, resolution });

    expect(result.topic).toBe('IN_SCOPE');
    expect(result.pendingCard?.proposal.customer.customerId).toBe(cyrillic.id);
  });

  it('a provider failure during a pinned turn is FAILED / PROVIDER, as today', async () => {
    const { cyrillic, run, resolvePinned } = await setup();
    const request = { customerId: cyrillic.id, currency: 'USD', lines: [{ description: 'Design', quantity: '1', price: '100' }] };
    const resolution = await resolvePinned(request);
    recordingModel(() => ({
      error: new APICallError({ message: 'upstream 503', url: 'https://x', requestBodyValues: {}, statusCode: 503, isRetryable: false }),
    }));

    const { result } = await run(LOOK_ALIKE, { request, resolution });

    expect(result.outcome).toBe('FAILED');
    expect(result.failure).toBe('PROVIDER');
  });

  it('a turn without pinned behaves as before: no prior tool step in the model input', async () => {
    const { run } = await setup();
    const prompts = recordingModel(() => ({ text: 'Hello.' }));

    const { result } = await run('How many invoices do I have?');

    expect(result.outcome).toBe('ANSWERED');
    expect(result.pendingCard).toBeUndefined();
    expect(toolResultsIn(prompts[0])).toHaveLength(0);
  });
});
