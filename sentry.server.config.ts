// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import {
  REDACTED,
  hasPrismaInvocation,
  prismaErrorCode,
  scrubPrismaError,
  scrubPrismaText,
} from '@/lib/helpers/prisma-error-scrub';

// Prisma call arguments are cut here, before an event or a console breadcrumb leaves the process
// (review 2026-09-30-2 S-01; sad.md "no request body is logged"). The scrub itself is shared with
// the server log sites: lib/helpers/prisma-error-scrub.ts.

type ScrubbableEvent = {
  message?: string;
  exception?: { values?: { type?: string; value?: string }[] };
  tags?: { [key: string]: unknown };
};

export function scrubPrismaEvent<T extends ScrubbableEvent>(event: T, hint?: { originalException?: unknown }): T {
  if (typeof event.message === 'string') event.message = scrubPrismaText(event.message);
  // The cut message no longer tells an outage from a conflict; the Prisma code does (U-03).
  const code = prismaErrorCode(hint?.originalException);
  if (code) event.tags = { ...event.tags, prisma_code: code };
  // The code belongs to the thrown error, which Sentry lists last; a linked cause gets none (V-02).
  const values = event.exception?.values ?? [];
  const original = hint?.originalException;
  for (const ex of values) {
    if (typeof ex.value !== 'string') continue;
    const exCode =
      ex === values[values.length - 1] && original instanceof Error && ex.type === original.name
        ? code
        : undefined;
    ex.value =
      ex.type === 'PrismaClientValidationError' && !hasPrismaInvocation(ex.value)
        ? `PrismaClientValidationError${REDACTED}`
        : scrubPrismaError(ex.value, exCode);
  }
  return event;
}

type ScrubbableBreadcrumb = { category?: string; message?: string; data?: { arguments?: unknown[] } };

export function scrubPrismaBreadcrumb<T extends ScrubbableBreadcrumb>(crumb: T): T {
  if (crumb.category !== 'console') return crumb;
  if (typeof crumb.message === 'string') crumb.message = scrubPrismaText(crumb.message);
  if (Array.isArray(crumb.data?.arguments)) {
    crumb.data.arguments = crumb.data.arguments.map((arg) =>
      typeof arg === 'string'
        ? scrubPrismaText(arg)
        : arg instanceof Error
          ? scrubPrismaError(`${arg.name}: ${arg.message}`, prismaErrorCode(arg))
          : arg,
    );
  }
  return crumb;
}

const isProduction = process.env.NODE_ENV === 'production';
const sentryEnabled = isProduction;

if (sentryEnabled && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,

    // Disable Sentry in development
    enabled: isProduction,

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: isProduction ? 0.1 : 0, // 10% у production, 0% у dev

    // Enable logs to be sent to Sentry
    enableLogs: isProduction,

    // Disable sending user PII for privacy
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
    sendDefaultPii: false,

    // Configuration for production environment
    environment: process.env.NODE_ENV,

    beforeSend: (event, hint) => scrubPrismaEvent(event, hint),
    beforeBreadcrumb: (crumb) => scrubPrismaBreadcrumb(crumb),
  });
}
