// T22 (spec.md §5 AC-27, adr/0010-carry-the-browser-time-zone-to-the-server-in-a-cookie.md) —
// day boundaries and "current month" use the validated browser time zone carried in the `tz`
// cookie, falling back to UTC; range ends are exclusive at the next local midnight (sad.md §8,
// Hard rule "Time and time zones"). Intl-only: no new dependency.
//
// Only `getRequestTimeZone` needs a request scope (via next/headers' `cookies()`); the pure
// day-bound helpers now live in lib/services/_shared/time-zone.ts and are re-exported here.
import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { redactError } from '@/lib/helpers/prisma-error-scrub';

const MAX_TZ_COOKIE_LENGTH = 100;
const FALLBACK_TIME_ZONE = 'UTC';

/**
 * Reads the browser-reported `tz` cookie set by the `TimeZoneCookie` client island and
 * validates it against `Intl`. Falls back to UTC for a missing, tampered, or oversized value —
 * never throws.
 */
export async function getRequestTimeZone(): Promise<string> {
  let value: string | undefined;
  try {
    value = (await cookies()).get('tz')?.value;
  } catch {
    // No request scope (e.g. a request-free caller of a wrapper): same UTC fallback, never throw.
    return FALLBACK_TIME_ZONE;
  }

  if (!value || value.length > MAX_TZ_COOKIE_LENGTH) {
    return FALLBACK_TIME_ZONE;
  }

  try {
    // Throws a RangeError for an unknown IANA zone (e.g. a tampered cookie value).
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return value;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

/**
 * The browser-reported zone from the `tz` cookie, or undefined when absent, oversized or unknown to
 * Intl. Since ADR-0006 this is only the first-visit seed for User.timeZone, never "today" itself.
 */
export async function getBrowserTimeZone(): Promise<string | undefined> {
  const zone = await getRequestTimeZone();
  return zone === FALLBACK_TIME_ZONE ? undefined : zone;
}

/**
 * T60 (ADR-0010 amendment): whether the private layouts' TimeZoneCookie should re-render the page
 * after writing the cookie. The cookie matters to the server only while the account has no saved
 * zone (the first-visit seed above), so only then. A refresh for any other account changes nothing
 * and can race the Freelancer's first navigation. A failed lookup keeps the old behaviour (refresh).
 */
export async function zoneCookieNeedsRefresh(userId: string): Promise<boolean> {
  try {
    // Lazy: loading this module must not require DATABASE_URL (same reason as session-actor.ts).
    const { getSavedTimeZone } = await import('@/lib/services/profile/profile');
    return (await getSavedTimeZone(userId)) === null;
  } catch (error) {
    unstable_rethrow(error);
    console.error('[zoneCookieNeedsRefresh] saved-zone lookup failed, refreshing:', redactError(error));
    return true;
  }
}

export {
  startOfLocalDay,
  localDayRange,
  currentLocalMonth,
  formatLocalDateKey,
} from '@/lib/services/_shared/time-zone';
