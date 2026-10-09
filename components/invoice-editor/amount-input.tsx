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

// editor-ux AC-13: money and quantity fields take "." as the only decimal separator. A change that
// contains "," is dropped whole (the field keeps its text), never rewritten — a pasted "12,5" must
// not silently become 125.
export function AmountInput({ value, onChange, ...props }: AmountInputProps) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      data-slot="amount-input"
      value={value}
      onChange={(e) => {
        if (e.target.value.includes(',')) return;
        onChange(e.target.value);
      }}
    />
  );
}
