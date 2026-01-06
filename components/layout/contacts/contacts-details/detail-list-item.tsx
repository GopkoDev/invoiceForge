import { Badge } from '@/components/ui/badge';
import { LucideIcon } from 'lucide-react';

interface DetailListItemBadge {
  label: string;
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
  title: string;
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
      <div className="flex items-start gap-4 flex-1 min-w-0">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 shrink-0">
          <Icon className={iconClassName} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="font-semibold text-sm truncate">{title}</p>
            {badges.map((badge, index) => (
              <Badge key={`badge-${badge.label}-${index}`} variant={badge.variant || 'secondary'}>
                {badge.label}
              </Badge>
            ))}
          </div>

          {details.length > 0 && (
            <div
              className={
                detailsLayout === 'horizontal'
                  ? 'flex items-center gap-4 text-xs text-muted-foreground flex-wrap'
                  : 'space-y-1 text-xs text-muted-foreground'
              }
            >
              {details.map((detail, index) => (
                <div key={`detail-${detail.value}-${index}`} className="flex items-center gap-1">
                  {detail.icon && <detail.icon className="h-3 w-3 shrink-0" />}
                  {detail.label && (
                    <span className="font-semibold shrink-0">
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
        <div className="flex items-center gap-1 shrink-0">{actions}</div>
      )}
    </div>
  );
}
