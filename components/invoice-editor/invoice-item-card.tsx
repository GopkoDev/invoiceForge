'use client';

import { GripVertical } from 'lucide-react';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { useInvoiceItemHandlers } from '@/hooks/use-invoice-item-handlers';
import { InvoiceItemProductSelector } from './invoice-item-product-selector';
import { InvoiceItemActions } from './invoice-item-actions';
import { Input } from '@/components/ui/input';
import { Label } from '../ui/label';
import { InvoiceItemFields } from './invoice-item-fields';

interface InvoiceItemCardProps {
  itemId: string;
  dragHandleProps?: {
    attributes: DraggableAttributes;
    listeners: SyntheticListenerMap | undefined;
  };
}

export function InvoiceItemCard({
  itemId,
  dragHandleProps,
}: InvoiceItemCardProps) {
  const {
    item,
    groupedProducts,
    currency,
    handleProductSelect,
    handleQuantityChange,
    handlePriceChange,
    handleProductNameChange,
    handleDelete,
    handleDuplicate,
    isCustomItem,
    isProductFromList,
  } = useInvoiceItemHandlers({ itemId });

  return (
    <div className="bg-background space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <button
          {...dragHandleProps?.attributes}
          {...dragHandleProps?.listeners}
          className="hover:bg-muted cursor-grab touch-none rounded p-1 active:cursor-grabbing"
        >
          <GripVertical className="text-muted-foreground h-4 w-4" />
        </button>

        <InvoiceItemActions
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />
      </div>

      <div className="space-y-1">
        {isCustomItem && <Label>Product Name</Label>}
        <InvoiceItemProductSelector
          productName={item.productName}
          productId={item.productId || ''}
          currency={currency}
          groupedProducts={groupedProducts}
          isCustomItem={isCustomItem}
          onProductSelect={handleProductSelect}
          onProductNameChange={handleProductNameChange}
        />
      </div>

      <InvoiceItemFields
        item={item}
        currency={currency}
        onPriceChange={handlePriceChange}
        onQuantityChange={handleQuantityChange}
        isPriceDisabled={isProductFromList}
        layout="mobile"
      />
    </div>
  );
}
