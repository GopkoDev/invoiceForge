'use client';

import { Input } from '@/components/ui/input';
import { Currency, InvoiceFormItem } from '@/types/invoice/types';
import { Label } from '../ui/label';

interface InvoiceItemFieldsProps {
  item: InvoiceFormItem;
  currency: Currency;
  onPriceChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  isPriceDisabled: boolean;
  layout?: 'desktop' | 'mobile';
}

export function InvoiceItemFields({
  item,
  currency,
  onPriceChange,
  onQuantityChange,
  isPriceDisabled,
  layout = 'desktop',
}: InvoiceItemFieldsProps) {
  const total = `${item.total.toFixed(2)} ${currency}`;

  if (layout === 'mobile') {
    return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Price</Label>
            <Input
              type="text"
              value={item.price}
              onChange={(e) => onPriceChange(e.target.value)}
              className="text-right"
              disabled={isPriceDisabled}
            />
          </div>
          <div className="space-y-1">
            <Label>Quantity</Label>
            <Input
              type="text"
              value={item.quantity}
              onChange={(e) => onQuantityChange(e.target.value)}
              className="text-right"
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-2">
          <span className="text-muted-foreground text-sm">Amount:</span>
          <span className="font-semibold">{total}</span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="w-24">
        <Input
          type="text"
          value={item.price}
          onChange={(e) => onPriceChange(e.target.value)}
          className="text-right"
          placeholder="Price"
          disabled={isPriceDisabled}
        />
      </div>

      <div className="w-20">
        <Input
          type="text"
          value={item.quantity}
          onChange={(e) => onQuantityChange(e.target.value)}
          className="text-right"
          placeholder="Qty"
        />
      </div>

      <div className="w-24 text-right font-medium">{total}</div>
    </>
  );
}
