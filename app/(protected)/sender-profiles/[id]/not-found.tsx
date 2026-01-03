import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { protectedRoutes } from '@/config/routes.config';
import { Card, CardContent } from '@/components/ui/card';

export default function SenderProfileNotFound() {
  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardContent className="space-y-6">
          <div className="flex min-h-[400px] flex-col items-center justify-center space-y-4 text-center">
            <AlertCircle className="h-16 w-16 text-muted-foreground" />

            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                Sender Profile Not Found
              </h1>
              <p className="text-muted-foreground text-sm">
                The sender profile you&apos;re looking for doesn&apos;t exist or
                you don&apos;t have access to it.
              </p>
            </div>

            <div className="flex gap-2">
              <Link href={protectedRoutes.senderProfiles}>
                <Button variant="default">Back to Sender Profiles</Button>
              </Link>

              <Link href={protectedRoutes.dashboard}>
                <Button variant="outline">Go to Dashboard</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
