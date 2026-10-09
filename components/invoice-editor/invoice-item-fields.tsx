'use client';

import { Input } from '@/components/ui/input';
import { FieldError } from '@/components/ui/field';
import { Currency, InvoiceFormItem } from '@/types/invoice/types';
import { Label } from '../ui/label';
import { useNumberDraft } from '@/hooks/use-number-draft';
import { useFieldErrors, useInvoiceItems } from '@/store/invoice-editor-store';

interface InvoiceItemFieldsProps {
  item: InvoiceFormItem;
  currency: Currency;
  onPriceChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  isPriceDisabled: boolean;
  /** The line is locked (issued or cancelled invoice). */
  disabled?: boolean;
  layout?: 'desktop' | 'mobile';
}

export function InvoiceItemFields({
  item,
  currency,
  onPriceChange,
  onQuantityChange,
  isPriceDisabled,
  disabled = false,
  layout = 'desktop',
}: InvoiceItemFieldsProps) {
  const total = `${item.total.toFixed(2)} ${currency}`;
  const priceInput = useNumberDraft(item.price, onPriceChange);
  const quantityInput = useNumberDraft(item.quantity, onQuantityChange);

  // VALIDATION fieldErrors are keyed by the submitted array index (contracts/server-actions.md,
  // AC-14/AC-15), so the field looks up its own position in the submitted items.
  const fieldErrors = useFieldErrors();
  const items = useInvoiceItems();
  const itemIndex = items.findIndex((i) => i.id === item.id);
  const priceErrors = fieldErrors?.[`items.${itemIndex}.price`];
  const quantityErrors = fieldErrors?.[`items.${itemIndex}.quantity`];
  const totalErrors = fieldErrors?.[`items.${itemIndex}.total`];

  if (layout === 'mobile') {
    return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Price</Label>
            <Input
              type="text"
              value={priceInput.value}
              onChange={(e) => priceInput.onChange(e.target.value)}
              className="text-right"
              disabled={disabled || isPriceDisabled}
              aria-invalid={!!priceErrors}
            />
            <FieldError
              errors={priceErrors?.map((message) => ({ message }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Quantity</Label>
            <Input
              type="text"
              value={quantityInput.value}
              onChange={(e) => quantityInput.onChange(e.target.value)}
              className="text-right"
              disabled={disabled}
              aria-invalid={!!quantityErrors}
            />
            <FieldError
              errors={quantityErrors?.map((message) => ({ message }))}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-2">
          <span className="text-muted-foreground text-sm">Amount:</span>
          <span className="font-semibold">{total}</span>
        </div>
        <FieldError errors={totalErrors?.map((message) => ({ message }))} />
      </>
    );
  }

  return (
    <>
      <div className="w-24">
        <Input
          type="text"
          value={priceInput.value}
          onChange={(e) => priceInput.onChange(e.target.value)}
          className="text-right"
          placeholder="Price"
          disabled={disabled || isPriceDisabled}
          aria-invalid={!!priceErrors}
        />
        <FieldError errors={priceErrors?.map((message) => ({ message }))} />
      </div>

      <div className="w-20">
        <Input
          type="text"
          value={quantityInput.value}
          onChange={(e) => quantityInput.onChange(e.target.value)}
          className="text-right"
          placeholder="Qty"
          disabled={disabled}
              aria-invalid={!!quantityErrors}
        />
        <FieldError
          errors={quantityErrors?.map((message) => ({ message }))}
        />
      </div>

      <div className="w-24 text-right font-medium">
        {total}
        <FieldError errors={totalErrors?.map((message) => ({ message }))} />
      </div>
    </>
  );
}
