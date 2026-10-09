'use client';

import { GripVertical } from 'lucide-react';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { useInvoiceItemHandlers } from '@/hooks/use-invoice-item-handlers';
import { useEditorLocks, useFieldErrors, useInvoiceItems } from '@/store/invoice-editor-store';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/ui/field';
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
  // invoice-integrity T16 (SCR-02): an issued or cancelled invoice's lines are read-only.
  const { locked } = useEditorLocks();
  // invoice-integrity T17: a catalogue product in another currency is named under its line (AC-12).
  const fieldErrors = useFieldErrors();
  const itemIndex = useInvoiceItems().findIndex((i) => i.id === itemId);
  const productErrors = fieldErrors?.[`items.${itemIndex}.productId`];

  return (
    <div className="bg-background grid grid-cols-2 gap-3 rounded-lg border p-4 md:flex md:items-center md:gap-2 md:p-3">
      {!locked && (
        <button
          {...dragHandleProps?.attributes}
          {...dragHandleProps?.listeners}
          aria-label={`Reorder line ${itemIndex + 1}`}
          className="hover:bg-muted cursor-grab touch-none justify-self-start rounded max-md:col-start-1 max-md:row-start-1 p-1 active:cursor-grabbing md:justify-self-auto"
        >
          <GripVertical className="text-muted-foreground h-4 w-4" />
        </button>
      )}

      <div className="col-span-2 min-w-0 space-y-1 md:col-span-1 md:flex-1 md:space-y-0">
        {isCustomItem && <Label className="md:hidden">Product Name</Label>}
        <InvoiceItemProductSelector
          productName={item.productName}
          productId={item.productId || ''}
          currency={currency}
          groupedProducts={groupedProducts}
          isCustomItem={isCustomItem}
          onProductSelect={handleProductSelect}
          onProductNameChange={handleProductNameChange}
          disabled={locked}
          invalid={!!productErrors}
        />
        <FieldError errors={productErrors?.map((message) => ({ message }))} />
      </div>

      <InvoiceItemFields
        item={item}
        currency={currency}
        onPriceChange={handlePriceChange}
        onQuantityChange={handleQuantityChange}
        isPriceDisabled={isProductFromList}
        disabled={locked}
      />

      {!locked && (
        <div className="flex justify-end max-md:col-start-2 max-md:row-start-1">
          <InvoiceItemActions
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            lineNumber={itemIndex + 1}
          />
        </div>
      )}
    </div>
  );
}
