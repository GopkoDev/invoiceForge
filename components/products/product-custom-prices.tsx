'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Pencil, Trash2, MoreVertical, Package, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useModal } from '@/store/use-modal-store';
import { SerializedCustomPrice } from '@/types/custom-price/types';
import { CustomPriceFormValues } from '@/lib/validations/custom-price';
import {
  updateCustomPrice,
  deleteCustomPrice,
} from '@/lib/actions/custom-price-actions';
import { CustomerInfo } from '@/components/custom-prices/custom-price-entity-cell';
import { formatCurrency } from '@/lib/helpers';
import { useProductCustomPriceModal } from '@/hooks/use-product-custom-price-modal';
import type { Currency } from '@prisma/client';

interface ProductCustomPricesProps {
  productId: string;
  productName: string;
  productPrice: number;
  productCurrency: Currency;
  productUnit: string;
  customPrices: SerializedCustomPrice[];
}

export function ProductCustomPrices({
  productId,
  productName,
  productPrice,
  productCurrency,
  productUnit,
  customPrices,
}: ProductCustomPricesProps) {
  const customPriceModal = useModal('customPriceModal');
  const confirmationModal = useModal('confirmationModal');
  const handleAddCustomPrice = useProductCustomPriceModal({
    productId,
    productPrice,
    productCurrency,
    productUnit,
  });

  const handleEditCustomPrice = useCallback(
    (price: SerializedCustomPrice) => {
      customPriceModal.open({
        open: true,
        close: customPriceModal.close,
        isEditing: true,
        mode: 'selectProduct',
        defaultValues: price,
        onFormSubmit: async (data: CustomPriceFormValues) => {
          const result = await updateCustomPrice(
            price.id,
            price.customerId,
            {
              name: data.name,
              price: data.price,
              notes: data.notes,
            },
            productId
          );
          if (result.success) {
            toast.success('Custom price updated successfully');
          } else {
            toast.error(result.error || 'Failed to update custom price');
            throw new Error(result.error);
          }
        },
        onLoadProducts: async () => [],
      });
    },
    [customPriceModal, productId]
  );

  const handleDeleteCustomPrice = useCallback(
    (price: SerializedCustomPrice) => {
      confirmationModal.open({
        open: true,
        onClose: confirmationModal.close,
        title: 'Delete Custom Price',
        description: `Are you sure you want to delete the custom price for "${price.customer.name}"? This action cannot be undone.`,
        variant: 'destructive',
        confirmText: 'Delete',
        onConfirm: async () => {
          const result = await deleteCustomPrice(
            price.id,
            price.customerId,
            productId
          );
          if (result.success) {
            toast.success('Custom price deleted successfully');
          } else {
            toast.error(result.error || 'Failed to delete custom price');
          }
          confirmationModal.close();
        },
      });
    },
    [confirmationModal, productId]
  );

  // Calculate price difference percentage
  const calculateDiscount = (defaultPrice: number, customPrice: number) => {
    if (defaultPrice === 0) return 0;
    return Math.round(((defaultPrice - customPrice) / defaultPrice) * 100);
  };

  if (customPrices.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <div className="text-sm font-semibold mb-2">No Custom Prices</div>
          <div className="text-muted-foreground text-xs max-w-md mb-4">
            Add special pricing for specific customers for <b>{productName}</b>.
          </div>
          <Button size="sm" onClick={handleAddCustomPrice}>
            <Plus className="h-4 w-4" />
            Add Custom Price
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[280px]">Customer</TableHead>
            <TableHead className="w-[140px]">Label</TableHead>
            <TableHead className="text-right w-[140px]">
              Default Price
            </TableHead>
            <TableHead className="text-right w-[180px]">Custom Price</TableHead>
            <TableHead className="w-[220px]">Notes</TableHead>
            <TableHead className="text-right w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customPrices.map((price) => {
            const discount = calculateDiscount(productPrice, price.price);
            const isDiscount = discount > 0;
            const isPremium = discount < 0;

            return (
              <TableRow key={price.id}>
                <TableCell className="font-medium">
                  <CustomerInfo
                    id={price.customer.id}
                    name={price.customer.name}
                    companyName={price.customer.companyName}
                  />
                </TableCell>
                <TableCell>
                  {price.name ? (
                    <Badge variant="outline" className="font-normal">
                      {price.name}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {new Date(price.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  <span className="line-through">
                    {formatCurrency(productPrice, productCurrency)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Badge variant="secondary" className="font-mono">
                      {formatCurrency(price.price, productCurrency)}
                    </Badge>
                    {isDiscount && (
                      <Badge variant="default" className="text-xs">
                        -{Math.abs(discount)}%
                      </Badge>
                    )}
                    {isPremium && (
                      <Badge variant="destructive" className="text-xs">
                        +{Math.abs(discount)}%
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-xs">
                  <span className="text-sm text-muted-foreground truncate block">
                    {price.notes || '-'}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'icon' })
                      )}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleEditCustomPrice(price)}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteCustomPrice(price)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
