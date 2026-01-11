'use client';

import { GripVertical } from 'lucide-react';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { useInvoiceItemHandlers } from '@/hooks/use-invoice-item-handlers';
import { InvoiceItemProductSelector } from './invoice-item-product-selector';
import { InvoiceItemFields } from './invoice-item-fields';
import { InvoiceItemActions } from './invoice-item-actions';

interface InvoiceItemRowProps {
  itemId: string;
  dragHandleProps?: {
    attributes: DraggableAttributes;
    listeners: SyntheticListenerMap | undefined;
  };
}

export function InvoiceItemRow({
  itemId,
  dragHandleProps,
}: InvoiceItemRowProps) {
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
    <div className="bg-background flex items-center gap-2 rounded-lg border p-3">
      <button
        {...dragHandleProps?.attributes}
        {...dragHandleProps?.listeners}
        className="hover:bg-muted cursor-grab touch-none rounded p-1 active:cursor-grabbing"
      >
        <GripVertical className="text-muted-foreground h-4 w-4" />
      </button>

      <div className="min-w-0 flex-1">
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
      />

      <InvoiceItemActions
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
      />
    </div>
  );
}
