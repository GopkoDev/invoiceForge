import { cn } from '@/lib/utils';

interface BankAccountFieldProps {
  icon: React.ReactNode;
  label: string;
  value: string | null | React.ReactNode;
  noDataLabel: string;
}

export function BankAccountField({
  icon,
  label,
  value,
  noDataLabel,
}: BankAccountFieldProps) {
  const hasData = value !== null && value !== '';
  const displayValue = hasData ? value : noDataLabel;

  return (
    <div className={cn('flex items-start gap-3', !hasData && 'opacity-30')}>
      <div className="size-6 flex items-center justify-center text-muted-foreground">
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium mb-1">
          {label}
        </p>

        <div className="text-sm break-all">{displayValue}</div>
      </div>
    </div>
  );
}
