// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import { REDACTED, hasPrismaInvocation, scrubPrismaText } from '@/lib/helpers/prisma-error-scrub';

// Prisma call arguments are cut here, before an event or a console breadcrumb leaves the process
// (review 2026-09-30-2 S-01; sad.md "no request body is logged"). The scrub itself is shared with
// the server log sites: lib/helpers/prisma-error-scrub.ts.

type ScrubbableEvent = {
  message?: string;
  exception?: { values?: { type?: string; value?: string }[] };
};

export function scrubPrismaEvent<T extends ScrubbableEvent>(event: T): T {
  if (typeof event.message === 'string') event.message = scrubPrismaText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (typeof ex.value !== 'string') continue;
    ex.value =
      ex.type === 'PrismaClientValidationError' && !hasPrismaInvocation(ex.value)
        ? `PrismaClientValidationError${REDACTED}`
        : scrubPrismaText(ex.value);
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
          ? scrubPrismaText(`${arg.name}: ${arg.message}`)
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

    beforeSend: (event) => scrubPrismaEvent(event),
    beforeBreadcrumb: (crumb) => scrubPrismaBreadcrumb(crumb),
  });
}
