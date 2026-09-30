// T27 (spec.md §5 AC-24, sad.md §5/§8, openapi.yaml operationId exportUserData) — hardened data
// export: requireSession() first (before any category is read), every AC-20 category read in
// parallel and scoped to the caller (Session dropped per exportVersion 2.0), file named for the
// product from config/site.config.ts.
import { NextResponse } from 'next/server';
import { captureException } from '@sentry/nextjs';
import { requireSession } from '@/lib/helpers/route-auth';
import { redactError } from '@/lib/helpers/prisma-error-scrub';
import { prisma } from '@/prisma';
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
  const session = await requireSession();
  if (!session.ok) {
    return session.response;
  }
  const { userId } = session;

  try {
    const [user, accounts, emailHistory, senderProfiles, customers, products, invoices] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            emailVerified: true,
            image: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.account.findMany({
          where: { userId },
          select: { provider: true, type: true, createdAt: true },
        }),
        prisma.emailHistory.findMany({ where: { userId } }),
        prisma.senderProfile.findMany({
          where: { userId },
          include: { bankAccounts: true },
        }),
        prisma.customer.findMany({
          where: { userId },
          include: {
            customPrices: {
              include: {
                product: {
                  select: { name: true, unit: true },
                },
              },
            },
          },
        }),
        prisma.product.findMany({
          where: { userId },
          include: {
            customPrices: {
              include: {
                customer: {
                  select: { name: true },
                },
              },
            },
          },
        }),
        prisma.invoice.findMany({
          where: { senderProfile: { userId } },
          include: { items: true },
        }),
      ]);

    if (!user) {
      // requireSession() already confirmed the User row exists; treat a race (deleted between
      // the check and here) the same as a failed export rather than leaking a partial file.
      return NextResponse.json(EXPORT_FAILED_BODY, { status: 500 });
    }

    const exportData = {
      exportDate: new Date().toISOString(),
      exportVersion: '2.0',
      user,
      accounts,
      emailHistory,
      senderProfiles,
      customers,
      products,
      invoices,
    };

    const jsonData = JSON.stringify(exportData, null, 2);
    const filename = `${siteConfig.branding.name} export ${utcDateString(new Date())}.json`;

    return new NextResponse(jsonData, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting user data:', redactError(error));
    captureException(error);
    return NextResponse.json(EXPORT_FAILED_BODY, { status: 500 });
  }
}
