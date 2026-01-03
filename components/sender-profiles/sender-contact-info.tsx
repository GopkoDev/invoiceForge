import { cn } from '@/lib/utils';

export function SenderContactInfo({
  profileData,
  IconComponent,
  href,
  noDataLabel,
}: {
  profileData: string | null;
  IconComponent: React.ElementType;
  href: string;
  noDataLabel: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-muted-foreground',
        profileData ? '' : 'opacity-30'
      )}
    >
      <IconComponent className="h-4 w-4 shrink-0" />
      {profileData ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate hover:underline"
        >
          {profileData}
        </a>
      ) : (
        <span className="truncate">{noDataLabel}</span>
      )}
    </div>
  );
}
