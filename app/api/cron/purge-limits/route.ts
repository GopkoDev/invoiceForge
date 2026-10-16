// ADR-0007: daily sweep of limit records older than 24 h and expired VerificationToken rows,
// called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. A GET, safe under ADR-0003's proxy rules;
// the path is on the public allowlist because the scheduler carries no session. Errors never
// echo internals; runs are reported to Sentry Crons.
import { timingSafeEqual } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { createLimitStore } from '@/lib/security/limits/limit-store';
import { purgeConversationsOlderThan90Days } from '@/lib/services/conversations/purge';
import {
  purgeRepeatMarks,
  purgeTraces,
  purgeTurnsAndCounters,
} from '@/lib/services/assistant-usage/purge';

export const dynamic = 'force-dynamic';

const MONITOR_SLUG = 'purge-limits';

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization');
  if (!secret || !header) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type StepReport = { step: string; deleted: number | null; ok: boolean };

// The four AI retention steps run on their own: one failing never skips the others. Sentry gets the
// step name only, never row data.
async function runAiSteps(now: Date): Promise<StepReport[]> {
  const steps: [string, (now: Date) => Promise<number>][] = [
    ['conversations', purgeConversationsOlderThan90Days],
    ['repeatMarks', purgeRepeatMarks],
    ['traces', purgeTraces],
    ['turnsAndCounters', purgeTurnsAndCounters],
  ];
  const reports: StepReport[] = [];
  for (const [step, run] of steps) {
    try {
      reports.push({ step, deleted: await run(now), ok: true });
    } catch {
      Sentry.captureException(new Error(`Purge step failed: ${step}`), {
        tags: { purgeStep: step },
      });
      reports.push({ step, deleted: null, ok: false });
    }
  }
  return reports;
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, code: 'UNAUTHORIZED', error: 'Not authorized.' },
      { status: 401 }
    );
  }

  const checkInId = Sentry.captureCheckIn({
    monitorSlug: MONITOR_SLUG,
    status: 'in_progress',
  });
  try {
    const store = createLimitStore();
    const deleted = await store.purgeOlderThan24h();
    // Expired Sign-in link tokens go in the same run; the body still counts limit rows.
    await store.purgeExpiredVerificationTokens();
    const steps = await runAiSteps(new Date());
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: MONITOR_SLUG,
      status: steps.every((s) => s.ok) ? 'ok' : 'error',
    });
    return NextResponse.json({ success: true, data: { deleted, steps } });
  } catch {
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: MONITOR_SLUG,
      status: 'error',
    });
    return NextResponse.json(
      { success: false, code: 'FAILED', error: 'Purge failed.' },
      { status: 500 }
    );
  }
}
