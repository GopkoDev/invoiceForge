import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface ErrorPageProps {
  code: string | number;
  message: string;
}

export function ErrorPageLayout({ code, message }: ErrorPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4 text-foreground">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex items-center gap-4 text-sm sm:text-base">
          <span className="text-2xl font-semibold sm:text-3xl">{code}</span>
          <Separator orientation="vertical" className="h-6 sm:h-8" />
          <span className="text-sm text-muted-foreground sm:text-base">
            {message}
          </span>
        </div>

        <div className="flex w-full flex-wrap justify-center gap-3">
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to home
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
