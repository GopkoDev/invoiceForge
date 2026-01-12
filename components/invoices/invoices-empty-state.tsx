'use client';

import { FileText, Search, Filter, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';

type EmptyStateType = 'no-invoices' | 'no-tab-results' | 'no-filter-results';

interface InvoicesEmptyStateProps {
  type: EmptyStateType;
  tabLabel?: string;
  onClearFilters?: () => void;
}

export function InvoicesEmptyState({
  type,
  tabLabel,
  onClearFilters,
}: InvoicesEmptyStateProps) {
  const content = {
    'no-invoices': {
      icon: FileText,
      title: 'No invoices yet',
      description:
        'Get started by creating your first invoice. It only takes a few minutes.',
      action: (
        <Link href="/invoices/new" className={buttonVariants()}>
          <PlusCircle className="mr-2 size-4" />
          Create Invoice
        </Link>
      ),
    },
    'no-tab-results': {
      icon: FileText,
      title: `No ${tabLabel || 'invoices'} found`,
      description: `You don't have any ${tabLabel?.toLowerCase() || 'invoices'} at the moment. They will appear here when available.`,
      action: null,
    },
    'no-filter-results': {
      icon: Search,
      title: 'No results found',
      description:
        "We couldn't find any invoices matching your current filters. Try adjusting your search criteria.",
      action: onClearFilters ? (
        <Button variant="outline" onClick={onClearFilters}>
          <Filter className="mr-2 size-4" />
          Clear Filters
        </Button>
      ) : null,
    },
  };

  const { icon: Icon, title, description, action } = content[type];

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="bg-muted mb-4 rounded-full p-4">
        <Icon className="text-muted-foreground size-8" />
      </div>
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="text-muted-foreground mb-6 max-w-sm text-sm">
        {description}
      </p>
      {action}
    </div>
  );
}
