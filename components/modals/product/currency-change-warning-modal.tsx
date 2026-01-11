'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatCurrency } from '@/lib/helpers/format-helpers';

interface CustomerWithCustomPrice {
  customerId: string;
  customerName: string;
  price: number;
}

export interface CurrencyChangeWarningModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  oldCurrency: string;
  newCurrency: string;
  customersAffected: CustomerWithCustomPrice[];
  isSubmitting?: boolean;
}

export function CurrencyChangeWarningModal({
  open,
  onClose,
  onConfirm,
  oldCurrency,
  newCurrency,
  customersAffected,
  isSubmitting = false,
}: CurrencyChangeWarningModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Currency Change Warning
          </DialogTitle>
          <DialogDescription>
            You are about to change the product currency from{' '}
            <Badge variant="outline" className="font-mono">
              {oldCurrency}
            </Badge>{' '}
            to{' '}
            <Badge variant="outline" className="font-mono">
              {newCurrency}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Custom Prices Will Be Affected</AlertTitle>
            <AlertDescription>
              This product has custom prices for {customersAffected.length}{' '}
              customer{customersAffected.length > 1 ? 's' : ''}. The currency
              for these custom prices will be automatically updated to{' '}
              <strong>{newCurrency}</strong>.
            </AlertDescription>
          </Alert>

          <div>
            <h4 className="mb-2 text-sm font-medium">
              Affected Customers ({customersAffected.length}):
            </h4>
            <div className="max-h-48 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Current Price</TableHead>
                    <TableHead className="text-right">
                      After Currency Change
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customersAffected.map((customer) => (
                    <TableRow key={customer.customerId}>
                      <TableCell className="font-medium">
                        {customer.customerName}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="font-mono">
                          {formatCurrency(customer.price, oldCurrency)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="default" className="font-mono">
                          {formatCurrency(customer.price, newCurrency)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Important</AlertTitle>
            <AlertDescription>
              The price values will remain the same, but the currency will
              change. Make sure this is what you want before proceeding. You may
              need to manually adjust the custom prices after this change.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Updating...' : 'Confirm Currency Change'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
