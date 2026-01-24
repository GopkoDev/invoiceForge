// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
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
    tracesSampleRate: isProduction ? 0.1 : 0,

    // Enable logs to be sent to Sentry
    enableLogs: isProduction,

    // Disable sending user PII for privacy
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
    sendDefaultPii: false,

    // Configuration for production environment
    environment: process.env.NODE_ENV,
  });
}
