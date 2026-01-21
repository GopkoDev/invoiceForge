import { UsersIcon } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/helpers/format-helpers';
import { DebtorInfo } from '@/types/dashboard';

interface DashboardDebtorsProps {
  debtors: DebtorInfo[];
}

export function DashboardDebtors({ debtors }: DashboardDebtorsProps) {
  const totalOverdueCount = debtors.reduce((acc, d) => acc + d.count, 0);
  const displayDebtors = debtors.slice(0, 3);
  const isEmpty = displayDebtors.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span id="debtors-title">Debtors</span>
          {!isEmpty && (
            <Badge
              variant="destructive"
              className="border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20"
            >
              {totalOverdueCount} overdue
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div
            className="bg-muted/20 flex h-48 flex-col items-center justify-center rounded-lg border border-dashed p-6"
            role="status"
            aria-labelledby="debtors-title"
          >
            <UsersIcon
              className="text-muted-foreground/50 mb-2 h-8 w-8"
              aria-hidden="true"
            />
            <p className="text-muted-foreground text-sm font-medium">
              No overdue invoices
            </p>
            <p className="text-muted-foreground/70 text-xs">
              All payments are on track
            </p>
          </div>
        ) : (
          <ul className="space-y-3" role="list" aria-labelledby="debtors-title">
            {displayDebtors.map((debtor) => (
              <li
                key={debtor.customerId}
                className="bg-muted/50 flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="bg-background flex h-8 w-8 items-center justify-center rounded-full"
                    aria-hidden="true"
                  >
                    <UsersIcon className="text-muted-foreground h-4 w-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {debtor.customerName}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {debtor.count} invoice{debtor.count !== 1 ? 's' : ''}{' '}
                      overdue
                      {debtor.currencies.length > 1 && (
                        <span className="ml-1">
                          ({debtor.currencies.join(', ')})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                <span
                  className="text-destructive font-mono text-sm font-semibold"
                  aria-label={`Total overdue: ${debtor.currencies.length === 1 ? formatCurrency(debtor.total, debtor.currencies[0]) : `${debtor.total.toLocaleString()} mixed currencies`}`}
                >
                  {debtor.currencies.length === 1
                    ? formatCurrency(debtor.total, debtor.currencies[0])
                    : `${debtor.total.toLocaleString()} (mixed)`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
