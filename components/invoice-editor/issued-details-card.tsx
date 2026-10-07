'use client';

// invoice-integrity T16 (SCR-02 issued/cancelled, ADR-0001, AC-01): once issued, the sender, Customer and
// bank account blocks show the invoice's issued details as text — never a picker over the current
// records, which may have changed since.
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface IssuedDetailsCardProps {
  title: string;
  icon: ReactNode;
  /** One printed line per entry; empty entries are skipped. */
  lines: Array<string | null | undefined>;
  /** A second block (the bank account), printed below the first. */
  extra?: { label: string; lines: Array<string | null | undefined> };
}

export function IssuedDetailsCard({ title, icon, lines, extra }: IssuedDetailsCardProps) {
  const shown = (values: Array<string | null | undefined>) => values.filter((v): v is string => !!v);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>As issued on this invoice.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-0.5">
          {shown(lines).map((line, i) => (
            <p key={i} className={i === 0 ? 'font-medium' : 'text-muted-foreground'}>
              {line}
            </p>
          ))}
        </div>
        {extra && (
          <div className="space-y-0.5">
            <p className="text-muted-foreground text-xs font-medium uppercase">{extra.label}</p>
            {shown(extra.lines).map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
