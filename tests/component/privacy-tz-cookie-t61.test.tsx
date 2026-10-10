// @vitest-environment jsdom
// T61 (review 2026-10-10-r5 Q3; ADR-0010 amendments): the sign-in pages and the signed-in app write a
// `tz` cookie with the browser's time zone, for one year. The privacy page's cookie section names it
// instead of claiming the app uses only one session cookie.
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/privacy',
}));

import { PrivacyPolicyContent } from '@/app/(public)/privacy/privacy-content';

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
});
