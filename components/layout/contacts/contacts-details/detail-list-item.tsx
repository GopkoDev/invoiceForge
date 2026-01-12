import { Badge } from '@/components/ui/badge';
import { LucideIcon } from 'lucide-react';
import React from 'react';

interface DetailListItemBadge {
  label?: string;
  content?: React.ReactNode;
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
}

interface DetailListItemDetail {
  icon?: LucideIcon;
  label?: string;
  value: string;
}

interface DetailListItemProps {
  icon: LucideIcon;
  iconClassName?: string;
  title: string | React.ReactNode;
  badges?: DetailListItemBadge[];
  details?: DetailListItemDetail[];
  detailsLayout?: 'vertical' | 'horizontal';
  actions?: React.ReactNode;
}

export function DetailListItem({
  icon: Icon,
  iconClassName = 'h-5 w-5 text-primary',
  title,
  badges = [],
  details = [],
  detailsLayout = 'vertical',
  actions,
}: DetailListItemProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <Icon className={iconClassName} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{title}</p>
            {badges.map((badge, index) => (
              <React.Fragment key={`badge-${index}`}>
                {badge.content ? (
                  badge.content
                ) : badge.label ? (
                  <Badge variant={badge.variant || 'secondary'}>
                    {badge.label}
                  </Badge>
                ) : null}
              </React.Fragment>
            ))}
          </div>

          {details.length > 0 && (
            <div
              className={
                detailsLayout === 'horizontal'
                  ? 'text-muted-foreground flex flex-wrap items-center gap-4 text-xs'
                  : 'text-muted-foreground space-y-1 text-xs'
              }
            >
              {details.map((detail, index) => (
                <div
                  key={`detail-${detail.value}-${index}`}
                  className="flex items-center gap-1"
                >
                  {detail.icon && <detail.icon className="h-3 w-3 shrink-0" />}
                  {detail.label && (
                    <span className="shrink-0 font-semibold">
                      {detail.label}:
                    </span>
                  )}
                  <span
                    className={detailsLayout === 'horizontal' ? '' : 'truncate'}
                  >
                    {detail.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      )}
    </div>
  );
}
