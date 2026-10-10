// @vitest-environment jsdom
// T61 (review 2026-10-10-r5 Q3; ADR-0010 amendments): the sign-in pages and the signed-in app write a
// `tz` cookie with the browser's time zone, for one year. The privacy page's cookie section names it
// instead of claiming the app uses only one session cookie.
// T66 (review 2026-10-10-r6 S1): the page states no fixed cookie count, names the Auth.js session
// cookie by its real name, and lists the Auth.js sign-in cookies and `sidebar_state`; the cookie
// banner mentions the time-zone cookie, which is set before sign-in.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/privacy',
}));

import { PrivacyPolicyContent } from '@/app/(public)/privacy/privacy-content';
import { CookieBanner } from '@/components/layout/cookie-banner';

function cookieSection() {
  const heading = screen.getByRole('heading', { name: /Cookies & Tracking/ });
  return heading.parentElement as HTMLElement;
}

describe('privacy page — cookies section (T61)', () => {
  it('does not claim the session cookie is the only cookie', () => {
    render(<PrivacyPolicyContent />);
    expect(cookieSection().textContent).not.toMatch(/one strictly necessary session cookie/i);
  });

  it('names the tz cookie, what it holds, why, where it is set and for how long', () => {
    render(<PrivacyPolicyContent />);
    const section = within(cookieSection());
    expect(section.getByText('tz', { selector: 'code' })).toBeInTheDocument();
    const text = cookieSection().textContent ?? '';
    expect(text).toMatch(/time zone/i);
    expect(text).toMatch(/1 year/i);
    expect(text).toMatch(/sign-in pages/i);
  });

  it('states no fixed cookie count', () => {
    render(<PrivacyPolicyContent />);
    expect(cookieSection().textContent).not.toMatch(/\b(one|two|three)\s+(first-party\s+)?cookies\b/i);
  });

  it('names the session cookie the app really sets (lib/helpers/session-cookies.ts)', () => {
    render(<PrivacyPolicyContent />);
    const section = within(cookieSection());
    expect(section.getByText('authjs.session-token', { selector: 'code' })).toBeInTheDocument();
    expect(section.getByText('__Secure-authjs.session-token', { selector: 'code' })).toBeInTheDocument();
    expect(cookieSection().textContent).not.toMatch(/next-auth\.session-token/);
  });

  it('lists the Auth.js sign-in cookies and the sidebar_state cookie', () => {
    render(<PrivacyPolicyContent />);
    const section = within(cookieSection());
    expect(section.getByText('sidebar_state', { selector: 'code' })).toBeInTheDocument();
    expect(section.getByText('authjs.csrf-token', { selector: 'code' })).toBeInTheDocument();
    expect(section.getByText('authjs.state', { selector: 'code' })).toBeInTheDocument();
    expect(section.getByText('authjs.pkce.code_verifier', { selector: 'code' })).toBeInTheDocument();
  });
});

describe('cookie banner (T66)', () => {
  it('mentions the time-zone cookie as well as the session cookie', async () => {
    localStorage.removeItem('cookie-consent');
    render(<CookieBanner />);
    const text = (await screen.findByText(/session cookie/i)).textContent ?? '';
    expect(text).toMatch(/time zone/i);
  });
});
