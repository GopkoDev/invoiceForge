'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// T22 (spec.md §5 AC-27, adr/0010-carry-the-browser-time-zone-to-the-server-in-a-cookie.md) —
// client island that writes the browser's IANA time zone into the `tz` cookie so the server can
// compute local day bounds and the current month (sad.md §8, Hard rule "Time and time zones").
// Renders nothing; runs once on mount.
//
// T57 (review r4 P5): the sign-in pages ((auth) layout) mount it with refresh={false}, so the zone
// is already in the cookie when the Sign-in link lands on a private page and the private layout
// has nothing to refresh. A refresh there could be cancelled by the Freelancer's first navigation
// (WebKit), and Next.js answered that failed fetch with a full load of the landing page. The
// private layouts keep the default (refresh) as the fallback for a missing or stale cookie, e.g.
// a Sign-in link opened in a different browser.

const TZ_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): string | undefined {
  return document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`))
    ?.split('=')[1];
}

interface TimeZoneCookieProps {
  /**
   * Re-render the server components once the cookie changed (default). False on pages that render
   * nothing zone-dependent: the cookie is written for the next request only.
   */
  refresh?: boolean;
}

export function TimeZoneCookie({ refresh = true }: TimeZoneCookieProps = {}) {
  const router = useRouter();

  useEffect(() => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (readCookie('tz') === browserTimeZone) {
      return;
    }

    document.cookie = `tz=${browserTimeZone}; path=/; max-age=${TZ_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    if (refresh) router.refresh();
    // Runs once on mount: the browser zone, router and mode are stable for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
