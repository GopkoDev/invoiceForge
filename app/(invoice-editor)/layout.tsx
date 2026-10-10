import { SessionRestoreGuard } from '@/components/session-restore-guard';
import { TimeZoneCookie } from '@/components/time-zone-cookie';
import { requireLiveUser } from '@/lib/helpers/route-auth';
import { zoneCookieNeedsRefresh } from '@/lib/helpers/time-zone';

export default async function InvoiceEditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // T09 (ADR-0002, AC-21): a stale token whose User row is gone is treated as a Visitor —
  // redirected to sign-in before any protected data renders.
  const { userId } = await requireLiveUser();
  const refreshZone = await zoneCookieNeedsRefresh(userId);

  return (
    <>
      <div className="bg-background min-h-screen">{children}</div>
      <SessionRestoreGuard />
      {/* T60: refresh only while the account has no saved zone (the cookie is then its seed). */}
      <TimeZoneCookie refresh={refreshZone} />
    </>
  );
}
