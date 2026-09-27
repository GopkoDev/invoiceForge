'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// T22 (spec.md §5 AC-27, adr/0010-carry-the-browser-time-zone-to-the-server-in-a-cookie.md) —
// client island that writes the browser's IANA time zone into the `tz` cookie so the server can
// compute local day bounds and the current month (sad.md §8, Hard rule "Time and time zones").
// Renders nothing; runs once on mount.

const TZ_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): string | undefined {
  return document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`))
    ?.split('=')[1];
}

export function TimeZoneCookie() {
  const router = useRouter();

  useEffect(() => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (readCookie('tz') === browserTimeZone) {
      return;
    }

    document.cookie = `tz=${browserTimeZone}; path=/; max-age=${TZ_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    router.refresh();
    // Runs once on mount: the browser zone and router are stable for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
