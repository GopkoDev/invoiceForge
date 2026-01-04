import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface ContactsDetailsContentCardLoadingProps {
  showHeader?: boolean;
  showHeaderAction?: boolean;
  contentHeight?: string;
}

export function ContactsDetailsContentCardLoading({
  showHeader = true,
  showHeaderAction = false,
  contentHeight = 'h-64',
}: ContactsDetailsContentCardLoadingProps) {
  return (
    <Card className="overflow-hidden">
      {showHeader && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            {showHeaderAction && <Skeleton className="h-9 w-24 rounded-md" />}
          </div>
        </CardHeader>
      )}

      <CardContent>
        <Skeleton className={`w-full ${contentHeight} rounded-md`} />
      </CardContent>
    </Card>
  );
}
