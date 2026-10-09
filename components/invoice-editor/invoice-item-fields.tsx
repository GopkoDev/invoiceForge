'use client';

import { useId } from 'react';
import { AmountInput } from './amount-input';
import { FieldError } from '@/components/ui/field';
import { Currency, InvoiceFormItem } from '@/types/invoice/types';
import { formatMoney } from '@/lib/format';
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
}

export function InvoiceItemFields({
  item,
  currency,
  onPriceChange,
  onQuantityChange,
  isPriceDisabled,
  disabled = false,
}: InvoiceItemFieldsProps) {
  const fieldId = useId();
  const total = formatMoney(item.total, currency);
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
  // Line fields announce their column and current position, e.g. "Quantity, line 3".
  const priceErrorId = `${fieldId}-price-error`;
  const quantityErrorId = `${fieldId}-quantity-error`;
  const priceName = `Price, line ${itemIndex + 1}`;
  const quantityName = `Quantity, line ${itemIndex + 1}`;

  // One tree for both layouts: the parent line container is a two-column grid on phones and a flex
  // row from md up (ADR-0004), so these cells are restyled, never swapped.
  return (
    <>
      <div className="space-y-1 md:w-24 md:space-y-0">
        <Label className="md:hidden">Price</Label>
        <AmountInput
          value={priceInput.value}
          onChange={priceInput.onChange}
          className="text-right"
          placeholder="Price"
          disabled={disabled || isPriceDisabled}
          aria-label={priceName}
          aria-invalid={!!priceErrors}
          aria-describedby={priceErrors ? priceErrorId : undefined}
        />
        <FieldError
          id={priceErrorId}
          errors={priceErrors?.map((message) => ({ message }))}
        />
      </div>

      <div className="space-y-1 md:w-20 md:space-y-0">
        <Label className="md:hidden">Quantity</Label>
        <AmountInput
          value={quantityInput.value}
          onChange={quantityInput.onChange}
          className="text-right"
          placeholder="Qty"
          disabled={disabled}
          aria-label={quantityName}
          aria-invalid={!!quantityErrors}
          aria-describedby={quantityErrors ? quantityErrorId : undefined}
        />
        <FieldError
          id={quantityErrorId}
          errors={quantityErrors?.map((message) => ({ message }))}
        />
      </div>

      <div className="col-span-2 flex items-center justify-between border-t pt-2 md:col-span-1 md:block md:w-24 md:border-t-0 md:pt-0 md:text-right">
        <span className="text-muted-foreground text-sm md:hidden">Amount:</span>
        <div className="font-semibold md:font-medium">
          {total}
          <FieldError errors={totalErrors?.map((message) => ({ message }))} />
        </div>
      </div>
    </>
  );
}
