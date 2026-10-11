'use client';

import * as React from 'react';
import { FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type AmountInputProps = Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'inputMode'
> & {
  value: string;
  onChange: (raw: string) => void;
};

// editor-ux AC-13: money and quantity fields use "." as the only decimal separator. Any change that
// contains a comma (typed or pasted) is rejected whole: the field keeps its previous value and
// onChange never receives a ",". A rejected comma shows a hint next to the field, announced politely
// to a screen reader and tied to the input with aria-describedby; it clears when the field loses focus.
export function AmountInput({
  value,
  onChange,
  onBlur,
  'aria-describedby': describedBy,
  ...props
}: AmountInputProps) {
  const hintId = React.useId();
  const [commaRejected, setCommaRejected] = React.useState(false);
  const describedByIds = [describedBy, commaRejected ? hintId : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        data-slot="amount-input"
        aria-describedby={describedByIds || undefined}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          if (next.includes(',')) {
            setCommaRejected(true);
            return;
          }
          onChange(next);
        }}
        onBlur={(e) => {
          setCommaRejected(false);
          onBlur?.(e);
        }}
      />
      <div aria-live="polite" className="contents">
        {commaRejected ? (
          <FieldDescription id={hintId} className="text-xs">
            Use a decimal point (.) as the separator.
          </FieldDescription>
        ) : null}
      </div>
    </>
  );
}
