// ai-chat-v2 T07 (spec §6 NFR "New read questions, response time p95"; test-plan.md §NFR validation): each of the
// three reads answers in p95 <= 800 ms server-side for a Freelancer with 20 sender profiles, 500 products and 2,000
// Customers, repeated 50 times through the service functions (the work both channels share).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { isContainerRuntimeAvailable } from './../support/db/docker-availability';
import { createFreelancer } from './../support/factories/user';
import { createSenderProfile } from './../support/factories/sender-profile';
import { createBankAccount } from './../support/factories/bank-account';
import { startMcpHarness, type McpHarness } from './../support/mcp-e2e';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const TZ = 'Europe/Kyiv';
const ROUNDS = 50;
const BUDGET_MS = 800;
const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];

describe.runIf(containerRuntimeAvailable)('New read questions latency (ai-chat-v2 T07)', () => {
  let h: McpHarness;
  let userId: string;

  beforeAll(async () => {
    h = await startMcpHarness();
    const prisma = h.factoryPrisma;
    userId = (await createFreelancer(prisma, { timeZone: TZ })).id;
    for (let i = 0; i < 20; i++) {
      const profile = await createSenderProfile(prisma, userId, { name: `Profile ${i}` });
      await createBankAccount(prisma, profile.id, { bankName: `Bank ${i}`, currency: 'USD', accountNumber: `26001234567${String(i).padStart(5, '0')}` });
    }
    const currencies = ['USD', 'EUR', 'GBP', 'UAH'] as const;
    const products: Prisma.ProductCreateManyInput[] = Array.from({ length: 500 }, (_v, i) => ({
      userId,
      name: `Catalogue Item ${i}`,
      unit: 'pcs',
      price: (i % 90) + 10,
      currency: currencies[i % currencies.length],
      isActive: true,
    }));
    await prisma.product.createMany({ data: products });
    const customers: Prisma.CustomerCreateManyInput[] = Array.from({ length: 2000 }, (_v, i) => ({
      userId,
      name: `Scale Client ${i}`,
      email: `scale-client-${i}@example.test`,
      defaultCurrency: 'USD',
    }));
    for (let i = 0; i < customers.length; i += 1000) await prisma.customer.createMany({ data: customers.slice(i, i + 1000) });
    expect(await prisma.customer.count({ where: { userId } })).toBe(2000);
    expect(await prisma.product.count({ where: { userId } })).toBe(500);
  }, 180_000);

  afterAll(async () => {
    await h?.stop();
  });

  async function measure(run: () => Promise<{ success: boolean }>) {
    await run(); // warm-up: connection and plan caches, as a running server has
    const times: number[] = [];
    for (let i = 0; i < ROUNDS; i += 1) {
      const start = performance.now();
      const res = await run();
      times.push(performance.now() - start);
      expect(res.success).toBe(true);
    }
    return p95(times);
  }

  it('list_sender_profiles p95 <= 800 ms with 20 profiles and their accounts', async () => {
    const { listSenderProfilesForAssistant } = await import('@/lib/services/sender-profiles/sender-profiles');
    const actor = await h.actor(userId, TZ);
    expect(await measure(() => listSenderProfilesForAssistant(actor, {}))).toBeLessThanOrEqual(BUDGET_MS);
  }, 120_000);

  it('list_products p95 <= 800 ms with 500 products, unfiltered and with a name filter', async () => {
    const { listProductsForAssistant } = await import('@/lib/services/products/products');
    const actor = await h.actor(userId, TZ);
    expect(await measure(() => listProductsForAssistant(actor, {}))).toBeLessThanOrEqual(BUDGET_MS);
    expect(await measure(() => listProductsForAssistant(actor, { name: 'catalogue item 4' }))).toBeLessThanOrEqual(BUDGET_MS);
  }, 120_000);

  it('list_customers p95 <= 800 ms with 2,000 Customers, unfiltered and with a folded name filter', async () => {
    const { listCustomersForAssistant } = await import('@/lib/services/customers/customers');
    const actor = await h.actor(userId, TZ);
    expect(await measure(() => listCustomersForAssistant(actor, {}))).toBeLessThanOrEqual(BUDGET_MS);
    expect(await measure(() => listCustomersForAssistant(actor, { name: 'scale client 19' }))).toBeLessThanOrEqual(BUDGET_MS);
  }, 120_000);
});

describe.runIf(!containerRuntimeAvailable)('New read questions latency (ai-chat-v2 T07)', () => {
  it.skip('skipped: no container runtime', () => {});
});
