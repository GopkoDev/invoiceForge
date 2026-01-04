import { cn } from '@/lib/utils';

interface ContactCardInfoProps {
  data: string | null;
  IconComponent: React.ElementType;
  href?: string;
  noDataLabel: string;
}

export function ContactCardInfo({
  data,
  IconComponent,
  href,
  noDataLabel,
}: ContactCardInfoProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-muted-foreground',
        data ? '' : 'opacity-30'
      )}
    >
      <IconComponent className="h-4 w-4 shrink-0" />
      {data ? (
        href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate hover:underline"
          >
            {data}
          </a>
        ) : (
          <span className="truncate">{data}</span>
        )
      ) : (
        <span className="truncate">{noDataLabel}</span>
      )}
    </div>
  );
}
