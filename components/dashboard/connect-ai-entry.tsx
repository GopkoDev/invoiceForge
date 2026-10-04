import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { protectedRoutes } from '@/config/routes.config';

export function ConnectAiEntry() {
  return (
    <div className="px-4 lg:px-6">
      <Alert>
        <Sparkles aria-hidden="true" />
        <AlertTitle>Connect your AI</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Ask Claude or Cursor who owes you money and what&apos;s coming in, straight from your
            invoiceFlow data. Read-only.
          </p>
          <Link
            href={protectedRoutes.settingsAssistants}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'w-full shrink-0 sm:w-auto'
            )}
          >
            Connect your AI →
          </Link>
        </AlertDescription>
      </Alert>
    </div>
  );
}
