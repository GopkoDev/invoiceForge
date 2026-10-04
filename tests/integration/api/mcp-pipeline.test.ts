// T12: POST /api/mcp request pipeline (source limit -> Bearer key -> key limit -> dispatch).
// ACs: AC-06 (revoked key refused at once), AC-07 (one uniform 401), AC-09 (a session cookie is
// never a key; no CORS), AC-11 (60 calls / 60 s per key), AC-26 (deleted account refused).
// DATABASE_URL is pointed at the throwaway container before '@/prisma' is imported.
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
import { createPersonalKey } from '../../support/factories/personal-key';
import { createLimitEvent } from '../../support/factories/limit-event';
import { sourceLimitKey } from '@/lib/security/limits/keys';

const containerRuntimeAvailable = await isContainerRuntimeAvailable();

const IP = '203.0.113.7';
const URL_ = 'http://localhost/api/mcp';

const UNIFORM_401_BODY = JSON.stringify({
  jsonrpc: '2.0',
  id: null,
  error: {
    code: -32001,
    message:
      "This Personal key is not valid. Ask the Freelancer to create a key on the Connect your AI page in invoiceFlow and put it in this assistant's settings.",
    data: { code: 'UNAUTHORIZED' },
  },
});

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' },
  },
};
const LIST = { jsonrpc: '2.0', id: 2, method: 'tools/list' };

function post(
  body: unknown,
  headers: Record<string, string> = {},
  ip: string | null = IP
): Request {
  return new Request(URL_, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(ip ? { 'x-real-ip': ip } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

describe.runIf(containerRuntimeAvailable)('POST /api/mcp (T12)', () => {
  let db: TestDatabase;
  let factoryPrisma: PrismaClient;
  let appPrisma: PrismaClient;
  let route: typeof import('@/app/api/mcp/route');

  beforeAll(async () => {
    db = await startTestDatabase();
    process.env.DATABASE_URL = db.connectionString;
    vi.resetModules();
    factoryPrisma = createTestPrismaClient(db.connectionString);
    ({ prisma: appPrisma } = (await import('@/prisma')) as {
      prisma: PrismaClient;
    });
    route = await import('@/app/api/mcp/route');
  }, 60_000);

  afterAll(async () => {
    await appPrisma?.$disconnect();
    await factoryPrisma?.$disconnect();
    await db?.stop();
  });

  beforeEach(() => truncateAllTables(factoryPrisma));
  afterEach(() => vi.restoreAllMocks());

  async function freelancerWithKey() {
    const user = await createFreelancer(factoryPrisma);
    const { row, fullKey } = await createPersonalKey(factoryPrisma, user.id);
    return { user, row, fullKey };
  }

  async function expectUniform401(res: Response) {
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(
      'Bearer realm="invoiceflow", error="invalid_token"'
    );
    expect(await res.text()).toBe(UNIFORM_401_BODY);
  }

  it('passes initialize and tools/list for a valid key (200)', async () => {
    const { fullKey } = await freelancerWithKey();
    const init = await route.POST(post(INIT, bearer(fullKey)));
    expect(init.status).toBe(200);
    expect((await init.json()).result.serverInfo).toBeDefined();
    const list = await route.POST(post(LIST, bearer(fullKey)));
    expect(list.status).toBe(200);
    expect((await list.json()).result.tools).toEqual([]);
  });

  it('answers a notification with 202', async () => {
    const { fullKey } = await freelancerWithKey();
    const res = await route.POST(
      post({ jsonrpc: '2.0', method: 'notifications/initialized' }, bearer(fullKey))
    );
    expect(res.status).toBe(202);
  });

  it('refuses a missing, malformed, unknown, Basic or session-cookie-only credential with the identical 401 (AC-07, AC-09)', async () => {
    const unknown = 'ifk_' + 'A'.repeat(43);
    const cases: Record<string, string>[] = [
      {},
      { cookie: 'authjs.session-token=valid-looking; __Secure-authjs.session-token=x' },
      { authorization: 'Bearer ' },
      { authorization: 'Bearer nonsense' },
      { authorization: `Bearer ${unknown}` },
      { authorization: `Basic ${Buffer.from('a:b').toString('base64')}` },
      { authorization: unknown },
    ];
    for (const headers of cases) {
      await expectUniform401(await route.POST(post(INIT, headers)));
    }
  });

  it('refuses a revoked key (AC-06) and the key of a deleted account (AC-26) with the identical 401', async () => {
    const a = await freelancerWithKey();
    expect((await route.POST(post(INIT, bearer(a.fullKey)))).status).toBe(200);
    await factoryPrisma.personalKey.update({
      where: { id: a.row.id },
      data: { revokedAt: new Date(), activeNameKey: null },
    });
    await expectUniform401(await route.POST(post(INIT, bearer(a.fullKey))));

    const b = await freelancerWithKey();
    await factoryPrisma.user.delete({ where: { id: b.user.id } });
    await expectUniform401(await route.POST(post(INIT, bearer(b.fullKey))));
  });

  it('records one refused key check per refusal and blocks the source with 429 at 30, before any key lookup', async () => {
    for (let i = 0; i < 30; i++) {
      await expectUniform401(await route.POST(post(INIT, {})));
    }
    const rows = await factoryPrisma.limitEvent.count({
      where: { scope: 'MCP_SOURCE', key: sourceLimitKey(IP), outcome: 'REFUSED' },
    });
    expect(rows).toBe(30);

    const { fullKey } = await freelancerWithKey();
    const querySpy = vi.spyOn(appPrisma, '$queryRaw');
    const res = await route.POST(post(INIT, bearer(fullKey)));
    expect(res.status).toBe(429);
    expect(querySpy).not.toHaveBeenCalled();
    const retry = Number(res.headers.get('retry-after'));
    expect(Number.isInteger(retry) && retry > 0 && retry <= 300).toBe(true);
    const body = await res.json();
    expect(body.error.code).toBe(-32029);
    expect(body.error.data.code).toBe('RATE_LIMITED');
    expect(body.error.data.details.kind).toBe('RETRY_AT');
    expect(body.error.message).toContain(
      'Too many refused key checks from this network. Try again after'
    );
    // another source is unaffected
    const other = await route.POST(post(INIT, bearer(fullKey), '198.51.100.9'));
    expect(other.status).toBe(200);
  });

  it('refuses the 61st call of a key in 60 s with 429 + Retry-After; other keys keep working (AC-11)', async () => {
    const a = await freelancerWithKey();
    const b = await freelancerWithKey();
    for (let i = 0; i < 60; i++) {
      await createLimitEvent(factoryPrisma, {
        scope: 'MCP_KEY',
        key: a.row.id,
        outcome: 'REQUESTED',
        userId: a.user.id,
        at: new Date(Date.now() - 1000),
      });
    }
    const res = await route.POST(post(LIST, bearer(a.fullKey)));
    expect(res.status).toBe(429);
    const retry = Number(res.headers.get('retry-after'));
    expect(Number.isInteger(retry) && retry > 0 && retry <= 60).toBe(true);
    const body = await res.json();
    expect(body.error.code).toBe(-32029);
    expect(body.error.message).toContain(
      'Too many calls with this Personal key: at most 60 calls a minute. Try again after'
    );
    // the refused call did not count
    expect(
      await factoryPrisma.limitEvent.count({
        where: { scope: 'MCP_KEY', key: a.row.id },
      })
    ).toBe(60);
    expect((await route.POST(post(LIST, bearer(b.fullKey)))).status).toBe(200);
  });

  it('counts every message that passed the key check, initialize and tools/list alike', async () => {
    const { row, fullKey } = await freelancerWithKey();
    await route.POST(post(INIT, bearer(fullKey)));
    await route.POST(post(LIST, bearer(fullKey)));
    await route.POST(post({ jsonrpc: '2.0', id: 3, method: 'ping' }, bearer(fullKey)));
    expect(
      await factoryPrisma.limitEvent.count({
        where: { scope: 'MCP_KEY', key: row.id },
      })
    ).toBe(3);
  });

  it('answers 503 with no Retry-After when the limit store is down, and no data', async () => {
    const { fullKey } = await freelancerWithKey();
    vi.spyOn(appPrisma, '$transaction').mockRejectedValue(new Error('down'));
    const res = await route.POST(post(INIT, bearer(fullKey)));
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBeNull();
    const body = await res.json();
    expect(body.error.code).toBe(-32003);
    expect(body.error.data).toEqual({ code: 'FAILED' });
    expect(body.error.message).toBe(
      'invoiceFlow cannot check its call limits right now, so the call was refused. Try again in a few minutes.'
    );
  });

  it('answers GET and DELETE with 405 + Allow: POST before any key check', async () => {
    const querySpy = vi.spyOn(appPrisma, '$queryRaw');
    for (const handler of [route.GET, route.DELETE]) {
      const res = await handler();
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');
    }
    expect(querySpy).not.toHaveBeenCalled();
  });

  it('sends no CORS headers', async () => {
    const { fullKey } = await freelancerWithKey();
    for (const res of [
      await route.POST(post(INIT, { ...bearer(fullKey), origin: 'https://evil.example' })),
      await route.POST(post(INIT, { origin: 'https://evil.example' })),
      await route.GET(),
    ]) {
      const names = [...res.headers.keys()].filter((h) =>
        h.startsWith('access-control-')
      );
      expect(names).toEqual([]);
    }
    expect('OPTIONS' in route).toBe(false);
  });
});
