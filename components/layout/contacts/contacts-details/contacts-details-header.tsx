import { buttonVariants } from '@/components/ui/button';
import { ArrowLeft, Pencil } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ContactsDetailsHeaderProps {
  title: string;
  description?: string | null;
  backHref: string;
  editHref: string;
  editLabel?: string;
}

export function ContactsDetailsHeader({
  title,
  description,
  backHref,
  editHref,
  editLabel = 'Edit',
}: ContactsDetailsHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Link
          href={backHref}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}
        </div>
      </div>

      <Link href={editHref} className={cn(buttonVariants())}>
        <Pencil className="h-4 w-4" />
        {editLabel}
      </Link>
    </div>
  );
}
