import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { protectedRoutes } from '@/config/routes.config';

interface ContentAreaNotFoundProps {
  title: string;
  description: string;
  backHref: string;
  backText?: string;
  dashboardHref?: string;
  dashboardText?: string;
}

export function ContentAreaNotFound({
  title,
  description,
  backHref,
  backText = 'Back',
  dashboardText = 'Go to Dashboard',
  dashboardHref = protectedRoutes.dashboard,
}: ContentAreaNotFoundProps) {
  return (
    <Card>
      <CardContent className="space-y-6">
        <div className="flex min-h-[300px] flex-col items-center justify-center space-y-4 text-center">
          <AlertCircle className="h-16 w-16 text-muted-foreground" />

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>

          <div className="flex gap-2 flex-wrap justify-center">
            <Link href={backHref}>
              <Button variant="default">
                <ArrowLeft className="h-4 w-4" />
                {backText}
              </Button>
            </Link>

            <Link href={dashboardHref}>
              <Button variant="outline">{dashboardText}</Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
