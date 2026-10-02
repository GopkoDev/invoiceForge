// T27 (spec.md §5 AC-24, sad.md §5/§8, openapi.yaml operationId exportUserData) — hardened data
// export: the session is checked first (before any category is read); the layer's
// getAccountExport reads every category in parallel, scoped to the caller. This route keeps the
// filename, headers and the 500 EXPORT_FAILED body (also used when the account vanished mid-call).
import { NextResponse } from 'next/server';
import { actingFreelancerForRoute } from '@/lib/helpers/session-actor';
import { getAccountExport } from '@/lib/services/account/account';
import { siteConfig } from '@/config/site.config';

const EXPORT_FAILED_BODY = {
  success: false,
  code: 'FAILED',
  error: "Your data couldn't be exported. Try again.",
} as const;

function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const session = await actingFreelancerForRoute(() => NextResponse.json(EXPORT_FAILED_BODY, { status: 500 }));
  if (!session.ok) {
    return session.response;
  }

  const result = await getAccountExport(session.actor);
  if (!result.success) {
    return NextResponse.json(EXPORT_FAILED_BODY, { status: 500 });
  }

  const jsonData = JSON.stringify(result.data, null, 2);
  const filename = `${siteConfig.branding.name} export ${utcDateString(new Date())}.json`;

  return new NextResponse(jsonData, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
