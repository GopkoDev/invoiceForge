// T9 - address refusals per UTC hour and the targeted-lockout alert (spec §6 NFR
// "Targeted-lockout alert"; TD-2 rolling 24 h dedupe).
//
// Seam assumed (not yet created):
//   lib/security/limits/limit-store.ts   createLimitStore(...).recordAddressRefusal(digest, at)
//        -> Promise<boolean>   inserts SIGNIN_ADDRESS/REFUSED unless one exists in at's UTC hour
//   lib/security/limits/lockout-alert.ts
//        createLockoutAlert({ prisma, clock }) -> {
//          checkLockout(digest, at): Promise<boolean>     // true when an alert was raised
//          onAddressLimited(digest, at): Promise<void>    // record refusal + check; never throws on Sentry failure
//        }
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
import { isContainerRuntimeAvailable } from '../../../support/db/docker-availability';
import {
  startTestDatabase,
  type TestDatabase,
} from '../../../support/db/container';
import { createTestPrismaClient } from '../../../support/db/client';
import { truncateAllTables } from '../../../support/db/truncate';
import {
  createLimitEvent,
  limitKeyDigest,
} from '../../../support/factories/limit-event';
import { createFixedClock } from '../../../support/clock';
import { createLimitStore } from '@/lib/security/limits/limit-store';
import { createLockoutAlert } from '@/lib/security/limits/lockout-alert';

const captureMessageMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureMessage: (...args: unknown[]) => captureMessageMock(...args),
}));

const containerRuntimeAvailable = await isContainerRuntimeAvailable();
const MIN = 60_000;
const HOUR = 60 * MIN;
const at = (iso: string) => new Date(`2026-10-02T${iso}:00.000Z`);

describe.runIf(containerRuntimeAvailable)('lockout alert (T9)', () => {
  let db: TestDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    db = await startTestDatabase();
    prisma = createTestPrismaClient(db.connectionString);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });

  // Braces matter: returning the mock would make vitest run it as a teardown callback.
  beforeEach(() => {
    captureMessageMock.mockReset();
  });
  afterEach(async () => {
    await truncateAllTables(prisma);
  });

  const rawAddress = 'victim@example.com';
  const digest = limitKeyDigest(rawAddress);
  const rows = (outcome: 'REFUSED' | 'ALERTED') =>
    prisma.limitEvent.findMany({
      where: { scope: 'SIGNIN_ADDRESS', key: digest, outcome },
    });

  function setup(start: string) {
    const clock = createFixedClock(at(start));
    const alert = createLockoutAlert({ prisma, clock });
    const refuse = (when: string) => {
      clock.set(at(when));
      return alert.onAddressLimited(digest, clock.now());
    };
    return { clock, alert, refuse };
  }

  it('records at most one REFUSED row per UTC hour (20 refusals -> 1 row)', async () => {
    const clock = createFixedClock(at('10:00'));
    const store = createLimitStore({ prisma, clock });
    for (let i = 0; i < 20; i++) {
      await store.recordAddressRefusal(
        digest,
        new Date(at('10:00').getTime() + i * MIN)
      );
    }
    expect(await rows('REFUSED')).toHaveLength(1);
    await store.recordAddressRefusal(digest, at('11:01'));
    expect(await rows('REFUSED')).toHaveLength(2);
  });

  it('raises one alert on refusals in 3 consecutive UTC hours (10:59, 11:01, 12:30)', async () => {
    const { refuse } = setup('10:59');
    await refuse('10:59');
    await refuse('11:01');
    expect(captureMessageMock).not.toHaveBeenCalled();
    await refuse('12:30');
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    expect(await rows('ALERTED')).toHaveLength(1);
  });

  it('the Sentry payload carries the digest and no raw address or IP', async () => {
    const { refuse } = setup('10:00');
    await refuse('10:00');
    await refuse('11:00');
    await refuse('12:00');
    const [message, context] = captureMessageMock.mock.calls[0];
    expect(context).toMatchObject({
      level: 'warning',
      extra: { addressDigest: digest },
    });
    expect(Object.keys(context.extra)).toEqual(['addressDigest']);
    const serialized = JSON.stringify([message, context]);
    expect(serialized).not.toContain(rawAddress);
    expect(serialized).not.toContain('example.com');
  });

  it('does not alert when hours are not consecutive (10 and 12 only)', async () => {
    const { refuse } = setup('10:00');
    await refuse('10:10');
    await refuse('12:10');
    expect(captureMessageMock).not.toHaveBeenCalled();
    expect(await rows('ALERTED')).toHaveLength(0);
  });

  it('does not alert again within a rolling 24 h (fourth consecutive hour)', async () => {
    const { refuse } = setup('10:00');
    await refuse('10:30');
    await refuse('11:30');
    await refuse('12:30');
    await refuse('13:30');
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
  });

  it('alerts again once the last alert is more than 24 h old and 3 hours run again', async () => {
    const { refuse } = setup('10:00');
    await refuse('10:30');
    await refuse('11:30');
    await refuse('12:30');
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const day = 24 * HOUR;
    const shifted = (h: number) =>
      new Date(at('12:30').getTime() + day + h * HOUR + MIN);
    const clock = createFixedClock(shifted(0));
    const alert = createLockoutAlert({ prisma, clock });
    for (const h of [0, 1, 2]) {
      clock.set(shifted(h));
      await alert.onAddressLimited(digest, clock.now());
    }
    expect(captureMessageMock).toHaveBeenCalledTimes(2);
  });

  it('a source-limit refusal alone records nothing (no REFUSED row via other scopes)', async () => {
    await createLimitEvent(prisma, {
      scope: 'SIGNIN_SOURCE',
      key: digest,
      outcome: 'REQUESTED',
      at: at('10:00'),
    });
    const { alert } = setup('12:30');
    expect(await alert.checkLockout(digest, at('12:30'))).toBe(false);
    expect(captureMessageMock).not.toHaveBeenCalled();
    expect(await rows('REFUSED')).toHaveLength(0);
  });

  it('a Sentry failure does not throw and ALERTED is still recorded', async () => {
    captureMessageMock.mockImplementation(() => {
      throw new Error('sentry down');
    });
    const { refuse } = setup('10:00');
    await refuse('10:00');
    await refuse('11:00');
    await expect(refuse('12:00')).resolves.toBeUndefined();
    expect(await rows('ALERTED')).toHaveLength(1);
  });
});
