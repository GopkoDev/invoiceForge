// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

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
  });
}
