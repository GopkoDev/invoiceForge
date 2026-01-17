import { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatCurrency } from '@/lib/helpers/format-helpers';

interface DashboardStatCardProps {
  title: string;
  value: number;
  count: number;
  currency?: string;
  icon: LucideIcon;
  iconClassName?: string;
  badgeText: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  footerText: string;
  isMonetary?: boolean;
}

export function DashboardStatCard({
  title,
  value,
  count,
  currency = 'USD',
  icon: Icon,
  iconClassName = 'text-muted-foreground',
  badgeText,
  badgeVariant = 'outline',
  footerText,
  isMonetary = true,
}: DashboardStatCardProps) {
  const badgeClass =
    badgeVariant === 'destructive'
      ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20'
      : '';

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {isMonetary ? formatCurrency(value, currency) : value}
        </CardTitle>
        <CardAction>
          <Badge variant={badgeVariant} className={badgeClass}>
            {count} {badgeText}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">
          <Icon className={`size-4 ${iconClassName}`} />
          {footerText}
        </div>
      </CardFooter>
    </Card>
  );
}
