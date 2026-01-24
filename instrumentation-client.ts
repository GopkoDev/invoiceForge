// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const isProduction = process.env.NODE_ENV === 'production';
const sentryEnabled = isProduction;

if (sentryEnabled && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Disable Sentry in development
    enabled: isProduction,

    // Add optional integrations for additional features (тільки у production)
    integrations: isProduction ? [Sentry.replayIntegration()] : [],

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: isProduction ? 0.1 : 0,

    // Enable logs to be sent to Sentry (тільки у production)
    enableLogs: isProduction,

    // Define how likely Replay events are sampled (only in production)
    replaysSessionSampleRate: isProduction ? 0 : 0,

    // Define how likely Replay events are sampled when an error occurs
    replaysOnErrorSampleRate: isProduction ? 1.0 : 0,

    // Disable sending user PII for privacy
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
    sendDefaultPii: false,

    // Configuration for production environment
    environment: process.env.NODE_ENV,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
