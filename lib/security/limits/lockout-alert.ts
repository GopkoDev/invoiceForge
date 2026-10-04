// Targeted-lockout alert: an address refused in each of 3 consecutive UTC hours
// raises one Sentry warning per rolling 24 h, carrying only the address digest.
import * as Sentry from '@sentry/nextjs';
import type { PrismaClient } from '@prisma/client';
import { createLimitStore, utcHourStart, type Clock } from './limit-store';

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

export interface LockoutAlertOverrides {
  prisma?: PrismaClient;
  clock?: Clock;
}

export function createLockoutAlert(overrides: LockoutAlertOverrides = {}) {
  const store = createLimitStore(overrides);

  /** True when an alert was raised. */
  async function checkLockout(digest: string, at: Date): Promise<boolean> {
    const raised = await store.withKeyLock(
      'SIGNIN_ADDRESS',
      digest,
      async (limit) => {
        const current = utcHourStart(at).getTime();
        for (const back of [0, 1, 2]) {
          const from = new Date(current - back * HOUR_MS);
          if (
            !(await limit.existsBetween(
              'REFUSED',
              from,
              new Date(from.getTime() + HOUR_MS)
            ))
          ) {
            return false;
          }
        }
        const dayAgo = new Date(at.getTime() - DAY_MS);
        if (
          await limit.existsBetween(
            'ALERTED',
            dayAgo,
            new Date(at.getTime() + 1)
          )
        ) {
          return false;
        }
        await limit.recordAt('ALERTED', at);
        return true;
      }
    );
    if (raised) {
      try {
        Sentry.captureMessage('Targeted sign-in lockout suspected', {
          level: 'warning',
          extra: { addressDigest: digest },
        });
      } catch {
        // Alerting must never break the sign-in path.
      }
    }
    return raised;
  }

  return {
    checkLockout,
    async onAddressLimited(digest: string, at: Date): Promise<void> {
      await store.recordAddressRefusal(digest, at);
      await checkLockout(digest, at);
    },
  };
}
