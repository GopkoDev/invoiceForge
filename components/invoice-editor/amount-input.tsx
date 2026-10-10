'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';

type AmountInputProps = Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'inputMode'
> & {
  value: string;
  onChange: (raw: string) => void;
};

// editor-ux AC-13: money and quantity fields use "." as the decimal separator. A single "," typed or
// pasted after digits, with no "." in the value yet, is read as the decimal point ("12,5" -> "12.5").
// Any other comma (a thousands separator like "1,234.50", more than one comma, or a comma after a
// ".") rejects the whole change and the field keeps its previous value.
function normalizeComma(next: string): string | null {
  if (!next.includes(',')) return next;
  if (next.includes('.')) return null;
  if (next.split(',').length !== 2) return null;
  if (!/\d,/.test(next)) return null;
  return next.replace(',', '.');
}

export function AmountInput({ value, onChange, ...props }: AmountInputProps) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      data-slot="amount-input"
      value={value}
      onChange={(e) => {
        const next = normalizeComma(e.target.value);
        if (next !== null) onChange(next);
      }}
    />
  );
}
