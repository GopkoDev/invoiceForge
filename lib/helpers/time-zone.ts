// T22 (spec.md §5 AC-27, adr/0010-carry-the-browser-time-zone-to-the-server-in-a-cookie.md) —
// day boundaries and "current month" use the validated browser time zone carried in the `tz`
// cookie, falling back to UTC; range ends are exclusive at the next local midnight (sad.md §8,
// Hard rule "Time and time zones"). Intl-only: no new dependency.
//
// Only `getRequestTimeZone` needs a request scope (via next/headers' `cookies()`); the pure
// day-bound helpers now live in lib/services/_shared/time-zone.ts and are re-exported here.
import { cookies } from 'next/headers';

const MAX_TZ_COOKIE_LENGTH = 100;
const FALLBACK_TIME_ZONE = 'UTC';

/**
 * Reads the browser-reported `tz` cookie set by the `TimeZoneCookie` client island and
 * validates it against `Intl`. Falls back to UTC for a missing, tampered, or oversized value —
 * never throws.
 */
export async function getRequestTimeZone(): Promise<string> {
  const store = await cookies();
  const value = store.get('tz')?.value;

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

export {
  startOfLocalDay,
  localDayRange,
  currentLocalMonth,
  formatLocalDateKey,
} from '@/lib/services/_shared/time-zone';
