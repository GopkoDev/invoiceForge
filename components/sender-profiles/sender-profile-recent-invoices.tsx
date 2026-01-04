'use client';

import { Button } from '@/components/ui/button';
import {
  FileText,
  Calendar,
  DollarSign,
  ExternalLink,
  Plus,
  User,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import {
  ContactsDetailsContentCard,
  DetailListItem,
} from '@/components/layout/contacts';

// Mock data - replace with real data later
const mockInvoices = [
  {
    id: '1',
    number: 'INV-2025-0001',
    date: 'Jan 15, 2025',
    customer: 'Acme Corp',
    amount: '1,250.00',
    currency: 'USD',
    status: 'paid',
  },
  {
    id: '2',
    number: 'INV-2025-0002',
    date: 'Jan 10, 2025',
    customer: 'Tech Solutions Inc',
    amount: '850.00',
    currency: 'USD',
    status: 'pending',
  },
  {
    id: '3',
    number: 'INV-2024-0145',
    date: 'Dec 28, 2024',
    customer: 'Global Services',
    amount: '2,100.00',
    currency: 'USD',
    status: 'overdue',
  },
];

function getStatusVariant(
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'paid':
      return 'default';
    case 'pending':
      return 'secondary';
    case 'overdue':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function SenderProfileRecentInvoices() {
  return (
    <ContactsDetailsContentCard
      title="Recent Invoices"
      description="Latest invoices from this profile"
      headerAction={
        <Button size="sm">
          <Plus className="h-4 w-4" />
          New Invoice
        </Button>
      }
      emptyState={{
        icon: FileText,
        title: 'No Invoices',
        description:
          'No invoices have been created with this sender profile yet. Create the first invoice to get started.',
        action: {
          label: 'Create Invoice',
          onClick: () => {
            // TODO: Open create invoice modal
          },
        },
      }}
      showEmpty={mockInvoices.length === 0}
    >
      <div className="space-y-4">
        {mockInvoices.map((invoice, index) => (
          <div key={invoice.id}>
            {index > 0 && <Separator className="mb-4" />}
            <DetailListItem
              icon={FileText}
              title={invoice.number}
              badges={[
                {
                  label: invoice.status,
                  variant: getStatusVariant(invoice.status),
                },
              ]}
              details={[
                {
                  icon: User,
                  value: invoice.customer,
                },
                {
                  icon: Calendar,
                  value: invoice.date,
                },
                {
                  icon: DollarSign,
                  value: `${invoice.amount} ${invoice.currency}`,
                },
              ]}
              detailsLayout="horizontal"
              actions={
                <Button variant="ghost" size="icon">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              }
            />
          </div>
        ))}

        <Separator />

        <div className="flex justify-center">
          <Button variant="outline" size="sm">
            View All Invoices
          </Button>
        </div>
      </div>
    </ContactsDetailsContentCard>
  );
}
