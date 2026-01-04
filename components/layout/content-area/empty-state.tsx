import Link from 'next/link';
import { Plus, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';

interface EmptyStateProps {
  title: string;
  description: string;
  href: string;
  linkText: string;
  Icon: LucideIcon;
}

export function EmptyState({
  title,
  description,
  href,
  linkText,
  Icon,
}: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16">
        <Icon className="h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground text-center mb-6 max-w-md">
          {description}
        </p>
        <Link href={href} className={buttonVariants()}>
          <Plus />
          {linkText}
        </Link>
      </CardContent>
    </Card>
  );
}
