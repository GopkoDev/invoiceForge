// MCP limit scopes (AC-11, ADR-0007): a per-key call window and a per-source refused-key-check
// window over the Postgres limit log. Every check and record runs under the per-(scope, key)
// advisory lock; any store error fails closed ({ unavailable: true }).
import type { PrismaClient } from '@prisma/client';
import { createLimitStore } from './limit-store';
import { scopeConfig } from './scopes';

export type McpLimitResult =
  | { allowed: true }
  | { allowed: false; retryAt: Date }
  | { unavailable: true };

export interface McpLimitOverrides {
  prisma?: PrismaClient;
}

export function createMcpLimits(overrides: McpLimitOverrides = {}) {
  // The store counts against its clock, so each call gets one pinned to the caller's `now`.
  const storeAt = (now: Date) =>
    createLimitStore({ prisma: overrides.prisma, clock: { now: () => now } });

  return {
    async checkMcpSource(
      sourceKey: string,
      now: Date
    ): Promise<McpLimitResult> {
      try {
        const { max } = scopeConfig('MCP_SOURCE');
        return await storeAt(now).withKeyLock(
          'MCP_SOURCE',
          sourceKey,
          async (limit): Promise<McpLimitResult> => {
            if ((await limit.countInWindow()) < max) return { allowed: true };
            const retryAt = await limit.retryAt();
            return retryAt ? { allowed: false, retryAt } : { allowed: true };
          }
        );
      } catch {
        return { unavailable: true };
      }
    },

    /** Never throws: a failed record must not change the caller's uniform 401. */
    async recordRefusedKeyCheck(sourceKey: string, now: Date): Promise<void> {
      try {
        await storeAt(now).withKeyLock(
          'MCP_SOURCE',
          sourceKey,
          async (limit) => {
            await limit.record('REFUSED');
          }
        );
      } catch {
        // The 401 stands whether or not the refusal was counted.
      }
    },

    async takeMcpKeyCall(
      keyId: string,
      userId: string,
      now: Date
    ): Promise<McpLimitResult> {
      try {
        const { max } = scopeConfig('MCP_KEY');
        return await storeAt(now).withKeyLock(
          'MCP_KEY',
          keyId,
          async (limit): Promise<McpLimitResult> => {
            if ((await limit.countInWindow()) >= max) {
              const retryAt = await limit.retryAt();
              if (retryAt) return { allowed: false, retryAt };
            }
            await limit.record('REQUESTED', { userId });
            return { allowed: true };
          }
        );
      } catch {
        return { unavailable: true };
      }
    },
  };
}

const defaultLimits = createMcpLimits();

export const checkMcpSource = defaultLimits.checkMcpSource;
export const recordRefusedKeyCheck = defaultLimits.recordRefusedKeyCheck;
export const takeMcpKeyCall = defaultLimits.takeMcpKeyCall;
