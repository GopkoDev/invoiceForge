import { AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { protectedRoutes } from '@/config/routes.config';

interface SetupCheckResult {
  hasSenderProfiles: boolean;
  hasBankAccounts: boolean;
  hasCustomers: boolean;
  hasProducts: boolean;
  isComplete: boolean;
}

interface DashboardSetupAlertProps {
  setupStatus: SetupCheckResult;
}

const SETUP_ITEMS = [
  {
    key: 'hasSenderProfiles',
    name: 'Sender Profile',
    href: protectedRoutes.senderProfiles,
  },
  {
    key: 'hasBankAccounts',
    name: 'Bank Account',
    href: protectedRoutes.senderProfiles,
  },
  {
    key: 'hasCustomers',
    name: 'Customer',
    href: protectedRoutes.customers,
  },
] as const;

export function DashboardSetupAlert({ setupStatus }: DashboardSetupAlertProps) {
  if (setupStatus.isComplete) {
    return null;
  }

  return (
    <div className="px-4 lg:px-6" role="alert" aria-live="polite">
      <Alert
        variant="destructive"
        className="border-yellow-500/50 bg-yellow-500/10 text-yellow-900 dark:text-yellow-100"
      >
        <AlertCircle
          className="h-4 w-4 text-yellow-600! dark:text-yellow-500!"
          aria-hidden="true"
        />
        <AlertTitle className="text-yellow-900 dark:text-yellow-100">
          Setup Required
        </AlertTitle>
        <AlertDescription className="mt-2 space-y-3">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            To create invoices, you need to complete the following steps:
          </p>
          <ul className="space-y-2" role="list">
            {SETUP_ITEMS.map((item) => {
              const isCompleted =
                setupStatus[item.key as keyof SetupCheckResult];
              return (
                <li key={item.key} className="flex items-center gap-2 text-sm">
                  {isCompleted ? (
                    <>
                      <CheckCircle2
                        className="h-4 w-4 text-green-600 dark:text-green-500"
                        aria-hidden="true"
                      />
                      <span className="text-green-700 dark:text-green-400">
                        {item.name}
                        <span className="sr-only"> (completed)</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle
                        className="h-4 w-4 text-yellow-600 dark:text-yellow-500"
                        aria-hidden="true"
                      />
                      <span className="text-yellow-800 dark:text-yellow-200">
                        {item.name}
                        <span className="sr-only"> (required)</span>
                      </span>
                      <Link
                        href={item.href}
                        className={cn(
                          buttonVariants({ variant: 'link', size: 'sm' }),
                          'h-auto p-0 text-yellow-700 hover:text-yellow-900 dark:text-yellow-300 dark:hover:text-yellow-100'
                        )}
                      >
                        Create →<span className="sr-only"> {item.name}</span>
                      </Link>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {!setupStatus.hasProducts && (
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              <span className="font-medium">Tip:</span> Consider creating{' '}
              <Link
                href="/products"
                className={cn(
                  buttonVariants({ variant: 'link', size: 'sm' }),
                  'h-auto p-0 text-yellow-700 underline hover:text-yellow-900 dark:text-yellow-300 dark:hover:text-yellow-100'
                )}
              >
                products
              </Link>{' '}
              for faster invoice creation.
            </p>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}
