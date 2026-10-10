import type { Metadata } from 'next';
import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { TimeZoneCookie } from '@/components/time-zone-cookie';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function AuthOneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // T57 (review r4 P5, ADR-0010 amendment): write the browser zone before sign-in, without a
  // refresh, so the private page the Sign-in link lands on finds the cookie current and the
  // private layout's TimeZoneCookie does not refresh (a refresh the first navigation could cancel).
  return (
    <>
      <AuthPageShell>{children}</AuthPageShell>
      <TimeZoneCookie refresh={false} />
    </>
  );
}
