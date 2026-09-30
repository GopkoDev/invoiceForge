'use client';

import { useTransition } from 'react';
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

  // N-10: no Sentry.captureException here — the loader's failed() already reported the cause
  // once (test-plan.md:109), and instrumentation.ts skips the 'load_failed' request error.

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
