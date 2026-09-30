'use client';

import { useEffect, useTransition } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useRouter } from 'next/navigation';
import { LoadError } from '@/components/layout/content-area/load-error';

export default function InvoiceEditorError({
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

  // F-37 (see app/(protected)/error.tsx, same fix): refresh() before reset(), both inside
  // startTransition, so retry actually recovers instead of re-rendering the cached failure.
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
