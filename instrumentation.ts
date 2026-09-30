import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// N-10 (AC-28): an AC-28 page throws 'load_failed' after its loader's failed() already reported
// the real cause, so reporting the request error too would be a second event for one failure.
export const onRequestError: typeof Sentry.captureRequestError = (error, ...rest) => {
  if (error instanceof Error && error.message === 'load_failed') {
    return;
  }
  return Sentry.captureRequestError(error, ...rest);
};
