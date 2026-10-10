// @vitest-environment jsdom
// T22 (spec.md §5 AC-27, adr/0010-carry-the-browser-time-zone-to-the-server-in-a-cookie.md) —
// the client island that writes the browser's IANA time zone into the `tz` cookie so the
// server can compute local day bounds and the current month.
//
// Checklist (task file): "on mount, if document.cookie tz != Intl.DateTimeFormat()
// .resolvedOptions().timeZone, set tz=<name>; path=/; max-age=31536000; SameSite=Lax and
// router.refresh() once — components/time-zone-cookie.tsx". Edge case table: "Cookie missing
// (first render) -> UTC; after the island sets it, the next render uses the browser zone."
//
// Seam: 'next/navigation' useRouter is mocked (same pattern as
// tests/component/load-error-boundaries.test.tsx) so router.refresh() is observable directly.
// Intl.DateTimeFormat is stubbed so the browser-reported zone is deterministic and does not
// depend on the machine running the test.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

import { TimeZoneCookie } from '@/components/time-zone-cookie';

function stubBrowserTimeZone(timeZone: string) {
  const original = Intl.DateTimeFormat;
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
    (...args: unknown[]) =>
      ({
        ...new original(...(args as ConstructorParameters<typeof Intl.DateTimeFormat>)),
        resolvedOptions: () => ({ timeZone }) as Intl.ResolvedDateTimeFormatOptions,
      }) as Intl.DateTimeFormat,
  );
}

function clearDocumentCookies() {
  document.cookie.split(';').forEach((entry) => {
    const name = entry.split('=')[0]?.trim();
    if (name) {
      document.cookie = `${name}=; max-age=0; path=/`;
    }
  });
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`))
    ?.split('=')[1];
}

describe('TimeZoneCookie (component, AC-27)', () => {
  beforeEach(() => {
    refresh.mockReset();
    clearDocumentCookies();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearDocumentCookies();
  });

  it('writes the tz cookie with the browser zone and refreshes once when the cookie is missing', () => {
    stubBrowserTimeZone('Europe/Kyiv');

    render(<TimeZoneCookie />);

    expect(readCookie('tz')).toBe('Europe/Kyiv');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('sets the documented cookie attributes (path=/, max-age=31536000, SameSite=Lax)', () => {
    stubBrowserTimeZone('America/New_York');
    const setterSpy = vi.spyOn(document, 'cookie', 'set');

    render(<TimeZoneCookie />);

    expect(setterSpy).toHaveBeenCalledWith(
      'tz=America/New_York; path=/; max-age=31536000; SameSite=Lax',
    );
  });

  it('does not rewrite the cookie or refresh when it already matches the browser zone', () => {
    stubBrowserTimeZone('Europe/Kyiv');
    document.cookie = 'tz=Europe/Kyiv; path=/; max-age=31536000; SameSite=Lax';
    const setterSpy = vi.spyOn(document, 'cookie', 'set');

    render(<TimeZoneCookie />);

    expect(setterSpy).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('updates a stale cookie value and refreshes once', () => {
    stubBrowserTimeZone('Europe/Kyiv');
    document.cookie = 'tz=UTC; path=/; max-age=31536000; SameSite=Lax';

    render(<TimeZoneCookie />);

    expect(readCookie('tz')).toBe('Europe/Kyiv');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('renders no visible markup', () => {
    stubBrowserTimeZone('UTC');

    const { container } = render(<TimeZoneCookie />);

    expect(container).toBeEmptyDOMElement();
  });
});

// T57 (review r4 P5; spec.md §5 AC-07, AC-08): the sign-in pages write the cookie WITHOUT a
// router.refresh(), so the zone is already current when the Sign-in link lands on a private page and
// the private layout has nothing to refresh. A refresh there could be cancelled by the Freelancer's
// first navigation (WebKit), and Next.js answered that with a full load of /dashboard.
describe('TimeZoneCookie refresh={false} (T57, sign-in pages)', () => {
  beforeEach(() => {
    refresh.mockReset();
    clearDocumentCookies();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearDocumentCookies();
  });

  it('writes the missing tz cookie and never calls router.refresh()', () => {
    stubBrowserTimeZone('Europe/Kyiv');
    const setterSpy = vi.spyOn(document, 'cookie', 'set');

    render(<TimeZoneCookie refresh={false} />);

    expect(setterSpy).toHaveBeenCalledWith(
      'tz=Europe/Kyiv; path=/; max-age=31536000; SameSite=Lax',
    );
    expect(readCookie('tz')).toBe('Europe/Kyiv');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('updates a stale tz cookie and never calls router.refresh()', () => {
    stubBrowserTimeZone('Europe/Kyiv');
    document.cookie = 'tz=UTC; path=/; max-age=31536000; SameSite=Lax';

    render(<TimeZoneCookie refresh={false} />);

    expect(readCookie('tz')).toBe('Europe/Kyiv');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('after a sign-in page wrote the cookie, the private TimeZoneCookie does not refresh', () => {
    stubBrowserTimeZone('Europe/Kyiv');

    const signInPage = render(<TimeZoneCookie refresh={false} />);
    signInPage.unmount();
    render(<TimeZoneCookie />);

    expect(refresh).not.toHaveBeenCalled();
  });
});
