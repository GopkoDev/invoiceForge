// T24: shared plumbing for the closing MCP acceptance suites. Boots the real POST /api/mcp route on
// a throwaway database and calls a tool with a Personal key. Not a test file itself.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { startTestDatabase, type TestDatabase } from './db/container';
import { createTestPrismaClient } from './db/client';

/** `ms` is the wall time of the POST handler alone (auth, limits, tool, serialisation). */
export type ToolResult = { isError: boolean; structuredContent: any; ms: number };

export interface McpHarness {
  db: TestDatabase;
  factoryPrisma: PrismaClient;
  appPrisma: PrismaClient;
  route: typeof import('@/app/api/mcp/route');
  dashboard: typeof import('@/lib/services/dashboard/dashboard');
  actor: (
    userId: string,
    timeZone?: string
  ) => Promise<import('@/lib/services/_shared/acting-freelancer').ActingFreelancer>;
  call: (key: string, name: string, args?: Record<string, unknown>) => Promise<ToolResult>;
  stop: () => Promise<void>;
}

let rpcId = 0;

/** DATABASE_URL is pointed at the throwaway container before any app module loads. */
export async function startMcpHarness(): Promise<McpHarness> {
  const db = await startTestDatabase();
  process.env.DATABASE_URL = db.connectionString;
  vi.resetModules();
  const factoryPrisma = createTestPrismaClient(db.connectionString);
  const { prisma: appPrisma } = (await import('@/prisma')) as { prisma: PrismaClient };
  const route = await import('@/app/api/mcp/route');
  const dashboard = await import('@/lib/services/dashboard/dashboard');
  const { actingFreelancerForTest } = await import('./acting-freelancer');

  const call: McpHarness['call'] = async (key, name, args = {}) => {
    // The per-key and per-source call limits are not under test here: reset them every call.
    await factoryPrisma.limitEvent.deleteMany();
    const started = performance.now();
    const res = await route.POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'x-real-ip': '203.0.113.9',
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
      })
    );
    const ms = performance.now() - started;
    expect(res.status).toBe(200);
    return { ...(await res.json()).result, ms } as ToolResult;
  };

  return {
    db,
    factoryPrisma,
    appPrisma,
    route,
    dashboard,
    actor: actingFreelancerForTest,
    call,
    stop: async () => {
      await factoryPrisma?.$disconnect();
      await appPrisma?.$disconnect();
      await db?.stop();
    },
  };
}

export const unwrap = <T>(r: { success: boolean; data?: T }): T => {
  if (!r.success) throw new Error(`dashboard call failed: ${JSON.stringify(r)}`);
  return r.data as T;
};

export const money = (n: number) => n.toFixed(2);
