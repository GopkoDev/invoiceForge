'use client';

import { useEffect, useTransition } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useRouter } from 'next/navigation';
import { LoadError } from '@/components/layout/content-area/load-error';

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  // N-17: isPending stays true until the refresh transition lands, driving the SCR-17
  // "retrying" state and blocking a second click.
  const [isPending, startTransition] = useTransition();

  // R-05: a server error carries a digest and failed() already reported it; an error without
  // one was raised in the browser and nothing else will report it.
  useEffect(() => {
    if (!error.digest) Sentry.captureException(error);
  }, [error]);

  // F-37: reset() before refresh() re-renders the segment from the still-cached error payload
  // before the refetch lands, so the first "Try again" can never recover. refresh() has to run
  // first (kick off the refetch), reset() second (clear the boundary onto the fresh data), both
  // inside startTransition so React treats the pair as one non-blocking update.
  function handleRetry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return <LoadError
      onRetry={handleRetry}
      retrying={isPending}
      errorDigest={error.digest}
    />;
}
