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
import { Plus, Pencil, Trash2, Package, MoreVertical } from 'lucide-react';
import { ContactsDetailsContentCard } from '@/components/layout/contacts';
import { useModal } from '@/store/use-modal-store';
import { SerializedCustomPrice } from '@/types/custom-price/types';
import { CustomPriceFormValues } from '@/lib/validations/custom-price';
import {
  createCustomPrice,
  updateCustomPrice,
  deleteCustomPrice,
} from '@/lib/actions/custom-price-actions';
import { ProductInfo } from '@/components/custom-prices/custom-price-entity-cell';
import { formatCurrency } from '@/lib/helpers';
import { getProducts } from '@/lib/actions/product-actions';

interface CustomerCustomPricesProps {
  customerId: string;
  customPrices: SerializedCustomPrice[];
}

type PriceAdjustmentType = 'discount' | 'premium' | 'none';

const calculateDiscount = (
  price: SerializedCustomPrice
): { value: number; type: PriceAdjustmentType } => {
  const defaultPrice = price.product.price;
  const customPrice = price.price;

  if (!defaultPrice || defaultPrice === customPrice) {
    return { value: 0, type: 'none' };
  }

  const diffPercent = Math.round(
    ((customPrice - defaultPrice) / defaultPrice) * 100
  );

  const type: PriceAdjustmentType =
    diffPercent < 0 ? 'discount' : diffPercent > 0 ? 'premium' : 'none';

  return { value: Math.abs(diffPercent), type };
};

const badgeType = {
  none: 'secondary',
  discount: 'default',
  premium: 'destructive',
} as const;

export function CustomerCustomPrices({
  customerId,
  customPrices,
}: CustomerCustomPricesProps) {
  const customPriceModal = useModal('customPriceModal');
  const confirmationModal = useModal('confirmationModal');

  const hasCustomPrices = customPrices.length > 0;

  const loadProductsList = useCallback(async () => {
    const result = await getProducts({ onlyActive: true });
    if (result.success && result.data) {
      return result.data;
    } else {
      toast.error(result.error || 'Failed to load products');
      return [];
    }
  }, []);

  const handleAddCustomPrice = useCallback(async () => {
    customPriceModal.open({
      open: true,
      close: customPriceModal.close,
      mode: 'selectProduct',
      onFormSubmit: async (data: CustomPriceFormValues) => {
        const result = await createCustomPrice(data, { customerId });
        if (result.success) {
          toast.success('Custom price created successfully');
        } else {
          toast.error(result.error || 'Failed to create custom price');
        }
      },
      onLoadProducts: loadProductsList,
    });
  }, [customerId, customPriceModal, loadProductsList]);

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
            customerId,
            data,
            price.productId
          );
          if (result.success) {
            toast.success('Custom price updated successfully');
          } else {
            toast.error(result.error || 'Failed to update custom price');
          }
        },
        onLoadProducts: loadProductsList,
      });
    },
    [customerId, customPriceModal, loadProductsList]
  );

  const handleDeleteCustomPrice = useCallback(
    (price: SerializedCustomPrice) => {
      confirmationModal.open({
        open: true,
        onClose: confirmationModal.close,
        title: 'Delete Custom Price',
        description: `Are you sure you want to delete the custom price for "${price.product.name}"? This action cannot be undone.`,
        variant: 'destructive',
        confirmText: 'Delete',
        onConfirm: async () => {
          const result = await deleteCustomPrice(
            price.id,
            customerId,
            price.productId
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
    [customerId, confirmationModal]
  );

  return (
    <ContactsDetailsContentCard
      title="Custom Prices"
      description="Special pricing for products and services"
      headerAction={
        <Button size="sm" onClick={handleAddCustomPrice}>
          <Plus className="h-4 w-4" />
          Add New
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
          onClick: handleAddCustomPrice,
        },
      }}
    >
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product/Service</TableHead>
              <TableHead>Label</TableHead>
              <TableHead className="text-right">Default Price</TableHead>
              <TableHead className="text-right">Custom Price</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customPrices.map((price) => {
              const { value: discountValue, type: discountType } =
                calculateDiscount(price);

              return (
                <TableRow key={price.id}>
                  <TableCell className="font-medium">
                    <ProductInfo
                      productId={price.product.id}
                      name={price.product.name}
                      unit={price.product.unit}
                      isActive={price.product.isActive}
                    />
                  </TableCell>
                  <TableCell>
                    {price.name ? (
                      <Badge variant="outline" className="font-normal">
                        {price.name}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground opacity-[0.3]">
                        No label
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    <span className="line-through">
                      {formatCurrency(
                        price.product.price,
                        price.product.currency
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Badge variant="secondary" className="font-mono">
                        {formatCurrency(price.price, price.product.currency)}
                      </Badge>

                      <Badge
                        variant={badgeType[discountType]}
                        className="text-xs"
                      >
                        {discountType === 'discount' ? '-' : '+'}
                        {discountValue}%
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {price.notes ? (
                      <span className="text-sm text-muted-foreground truncate block">
                        {price.notes}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground opacity-[0.3]">
                        No notes
                      </span>
                    )}
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
    </ContactsDetailsContentCard>
  );
}
