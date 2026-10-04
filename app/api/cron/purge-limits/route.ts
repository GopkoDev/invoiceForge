// ADR-0007: daily sweep of limit records older than 24 h and expired VerificationToken rows,
// called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. A GET, safe under ADR-0003's proxy rules;
// the path is on the public allowlist because the scheduler carries no session. Errors never
// echo internals; runs are reported to Sentry Crons.
import { timingSafeEqual } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { createLimitStore } from '@/lib/security/limits/limit-store';

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
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: MONITOR_SLUG,
      status: 'ok',
    });
    return NextResponse.json({ success: true, data: { deleted } });
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
