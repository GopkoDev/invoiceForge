'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash2, Package } from 'lucide-react';
import { ContactsDetailsContentCard } from '@/components/layout/contacts';

// Mock data - replace with real data later
const mockCustomPrices = [
  {
    id: '1',
    productName: 'Web Development Service',
    defaultPrice: '200.00',
    customPrice: '150.00',
    currency: 'USD',
    unit: 'hour',
    notes: 'Hourly rate for this client',
  },
  {
    id: '2',
    productName: 'UI/UX Design',
    defaultPrice: '150.00',
    customPrice: '120.00',
    currency: 'USD',
    unit: 'hour',
    notes: 'Special discount applied',
  },
  {
    id: '3',
    productName: 'Consulting Services',
    defaultPrice: '300.00',
    customPrice: '250.00',
    currency: 'USD',
    unit: 'session',
    notes: 'Package deal',
  },
];

export function CustomerCustomPrices() {
  const hasCustomPrices = mockCustomPrices.length > 0;

  return (
    <ContactsDetailsContentCard
      title="Custom Prices"
      description="Special pricing for products and services"
      headerAction={
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Add Custom Price
        </Button>
      }
      showEmpty={!hasCustomPrices}
      emptyState={{
        icon: Package,
        title: 'No Custom Prices',
        description:
          'Set special prices for specific products or services. Custom prices override default pricing when creating invoices.',
        action: {
          label: 'Add Custom Price',
          onClick: () => console.log('Add custom price'),
        },
      }}
    >
      <div className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product/Service</TableHead>
                <TableHead className="text-right">Default Price</TableHead>
                <TableHead className="text-right">Custom Price</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockCustomPrices.map((price) => (
                <TableRow key={price.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center h-8 w-8 rounded bg-primary/10 shrink-0">
                        <Package className="h-4 w-4 text-primary" />
                      </div>
                      <span>{price.productName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    <span className="line-through">
                      {price.defaultPrice} {price.currency}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="font-mono">
                      {price.customPrice} {price.currency}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground text-sm">
                      per {price.unit}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <span className="text-sm text-muted-foreground truncate block">
                      {price.notes || '-'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          <strong>Note:</strong> This is UI only. Product management and custom
          price logic will be implemented when Products feature is added.
        </div>
      </div>
    </ContactsDetailsContentCard>
  );
}
