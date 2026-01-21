import { FileText } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/helpers/format-helpers';
import { ExpectedPaymentGroup } from '@/types/dashboard';

interface DashboardExpectedPaymentsProps {
  payments: ExpectedPaymentGroup[];
}

function formatDueDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function DashboardExpectedPayments({
  payments,
}: DashboardExpectedPaymentsProps) {
  const totalPendingCount = payments.reduce((acc, p) => acc + p.count, 0);

  const allInvoices = payments.flatMap((p) => p.invoices);
  const nearestInvoices = allInvoices
    .sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    )
    .slice(0, 3);

  const isEmpty = nearestInvoices.length === 0;
  const remainingCount = allInvoices.length - 3;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span id="payments-title">Expected Payments</span>
          {!isEmpty && (
            <Badge variant="outline">{totalPendingCount} pending</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div
            className="bg-muted/20 flex h-48 flex-col items-center justify-center rounded-lg border border-dashed p-6"
            role="status"
            aria-labelledby="payments-title"
          >
            <FileText
              className="text-muted-foreground/50 mb-2 h-8 w-8"
              aria-hidden="true"
            />
            <p className="text-muted-foreground text-sm font-medium">
              No pending invoices
            </p>
            <p className="text-muted-foreground/70 text-xs">
              All invoices are paid or draft
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <ul role="list" aria-labelledby="payments-title">
              {nearestInvoices.map((inv) => (
                <li
                  key={inv.id}
                  className="bg-muted/30 mb-2 flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <FileText
                      className="text-muted-foreground h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">
                        {inv.invoiceNumber}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {inv.customerName} • Due {formatDueDate(inv.dueDate)}
                      </span>
                    </div>
                  </div>
                  <span
                    className="font-mono text-xs font-medium"
                    aria-label={`Amount: ${formatCurrency(inv.total, inv.currency)}`}
                  >
                    {formatCurrency(inv.total, inv.currency)}
                  </span>
                </li>
              ))}
            </ul>
            {remainingCount > 0 && (
              <p className="text-muted-foreground px-3 pt-1 text-xs">
                +{remainingCount} more invoice
                {remainingCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
