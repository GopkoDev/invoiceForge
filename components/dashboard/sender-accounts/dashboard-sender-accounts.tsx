'use client';

import { ChevronDown, Building2, Wallet } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/helpers/format-helpers';
import { SenderAccountMetrics } from '@/types/dashboard';
import { useState } from 'react';

interface DashboardSenderAccountsProps {
  senderAccounts: SenderAccountMetrics[];
  currency: string;
}

export function DashboardSenderAccounts({
  senderAccounts,
  currency,
}: DashboardSenderAccountsProps) {
  const [expandedSenders, setExpandedSenders] = useState<Set<string>>(() =>
    senderAccounts.length > 0
      ? new Set([senderAccounts[0].senderProfileId])
      : new Set()
  );

  const toggleSender = (senderProfileId: string) => {
    setExpandedSenders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(senderProfileId)) {
        newSet.delete(senderProfileId);
      } else {
        newSet.add(senderProfileId);
      }
      return newSet;
    });
  };

  if (senderAccounts.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Funds by Account</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/20 flex h-48 flex-col items-center justify-center rounded-lg border border-dashed p-6">
            <Wallet className="text-muted-foreground/50 mb-2 h-8 w-8" />
            <p className="text-muted-foreground text-sm font-medium">
              No accounts found
            </p>
            <p className="text-muted-foreground/70 text-xs">
              No invoices for {currency} currency
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Funds by Account</CardTitle>
          <Badge variant="outline" className="font-mono text-xs">
            {currency}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {senderAccounts.map((sender) => {
          const isExpanded = expandedSenders.has(sender.senderProfileId);
          const totalAmount = sender.totalReceived + sender.totalPlanned;
          const receivedPercentage =
            totalAmount > 0 ? (sender.totalReceived / totalAmount) * 100 : 0;
          const allFutureAmount = sender.allFuturePlanned;

          return (
            <div
              key={sender.senderProfileId}
              className="bg-muted/20 overflow-hidden rounded-lg border"
            >
              {/* Sender Header */}
              <button
                onClick={() => toggleSender(sender.senderProfileId)}
                className="hover:bg-muted/40 w-full px-3 py-2 text-left transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="bg-primary/10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                      <Building2 className="text-primary h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <h3 className="truncate text-sm font-semibold">
                          {sender.senderName}
                        </h3>
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {sender.accounts.length} account
                          {sender.accounts.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <div className="font-mono text-sm font-semibold">
                        {formatCurrency(totalAmount, currency)}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {receivedPercentage.toFixed(0)}% received
                      </div>
                      {allFutureAmount > 0 && (
                        <div className="text-muted-foreground text-xs">
                          All future:{' '}
                          {formatCurrency(allFutureAmount, currency)}
                        </div>
                      )}
                    </div>
                    <ChevronDown
                      className={cn(
                        'text-muted-foreground h-4 w-4 shrink-0 transition-transform',
                        isExpanded && 'rotate-180'
                      )}
                    />
                  </div>
                </div>
              </button>

              {/* Accounts List */}
              {isExpanded && (
                <div className="bg-background/50 space-y-1.5 border-t px-3 py-2">
                  {sender.accounts.map((account) => {
                    const accountTotal = account.received + account.planned;
                    const accountReceivedPercentage =
                      accountTotal > 0
                        ? (account.received / accountTotal) * 100
                        : 0;

                    return (
                      <div
                        key={account.accountId}
                        className="bg-card space-y-1.5 rounded-md border p-2.5"
                      >
                        {/* Account Header */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <Wallet className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                            <span className="truncate text-sm font-medium">
                              {account.accountName}
                            </span>
                          </div>
                          <span className="shrink-0 font-mono text-sm font-semibold">
                            {formatCurrency(accountTotal, currency)}
                          </span>
                        </div>

                        {/* Metrics Row */}
                        <div className="flex items-center justify-between gap-4 text-xs">
                          <div className="flex gap-3">
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">
                                Received
                              </span>
                              <span className="font-mono font-medium">
                                {formatCurrency(account.received, currency)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">
                                Planned
                              </span>
                              <span className="font-mono font-medium">
                                {formatCurrency(account.planned, currency)}
                              </span>
                            </div>
                          </div>
                          <span className="text-muted-foreground shrink-0 font-medium">
                            {accountReceivedPercentage.toFixed(0)}%
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
                          <div
                            className="bg-foreground/80 h-full"
                            style={{
                              width: `${accountReceivedPercentage}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
