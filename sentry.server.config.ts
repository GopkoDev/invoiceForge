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

type ScrubbableRequest = {
  request?: {
    url?: string;
    headers?: Record<string, string>;
    data?: unknown;
    cookies?: unknown;
  };
};

/** /api/mcp: never report the Authorization header, any other header, or a body (sad.md §8). */
export function scrubMcpRequest<T extends ScrubbableRequest>(event: T): T {
  const request = event.request;
  if (!request || typeof request.url !== 'string') return event;
  if (!isMcpUrl(request.url)) return event;
  delete request.headers;
  delete request.data;
  delete request.cookies;
  return event;
}

export function isMcpUrl(url: string): boolean {
  try {
    // A leading slash run must stay a path ('//api/mcp' would parse as a host), so join it to the base.
    const target = /^[/\\]/.test(url) ? `http://localhost${url}` : url;
    // Next matches the percent-decoded path in production ('/api/%6Dcp' reaches the handler).
    const path = decodeURIComponent(new URL(target, 'http://localhost').pathname).replace(/[/\\]+/g, '/');
    return path.replace(/\/$/, '') === '/api/mcp';
  } catch {
    // A path that fails to decode is treated as MCP: scrub rather than leak.
    return true;
  }
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

    // Node's HTTP integration would attach the incoming body to the transaction; never for /api/mcp.
    // Replaces the @sentry/nextjs default, so it keeps that default's disabled request spans.
    integrations: [
      Sentry.httpIntegration({
        disableIncomingRequestSpans: true,
        ignoreIncomingRequestBody: isMcpUrl,
      }),
    ],
    beforeSend: (event, hint) =>
      scrubMcpRequest(scrubPrismaEvent(event, hint)),
    beforeSendTransaction: (event) => scrubMcpRequest(event),
    beforeBreadcrumb: (crumb) => scrubPrismaBreadcrumb(crumb),
  });
}
