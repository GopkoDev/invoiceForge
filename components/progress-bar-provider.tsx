'use client';

import { ProgressProvider } from '@bprogress/next/app';
import { siteConfig } from '@/config/site.config';

export function ProgressBarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!siteConfig.enableProgressBar) return <>{children}</>;

  return (
    <ProgressProvider
      height="3px"
      color="var(--primary)"
      shallowRouting={true}
      options={{ showSpinner: false }}
    >
      {children}
    </ProgressProvider>
  );
}
