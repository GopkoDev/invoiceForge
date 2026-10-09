'use client';

import { useId } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { AmountInput } from './amount-input';
import { FieldError } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { formatMoney } from '@/lib/format';
import { Calculator } from 'lucide-react';
import { parseDecimalDraft, useNumberDraft } from '@/hooks/use-number-draft';
import {
  useSummary,
  useInvoiceCurrency,
  useInvoiceEditorActions,
  useFieldErrors,
  useEditorLocks,
} from '@/store/invoice-editor-store';

export function SummarySection() {
  const fieldId = useId();
  const currency = useInvoiceCurrency();
  const { updateField } = useInvoiceEditorActions();
  const { subtotal, taxRate, taxAmount, discount, shipping, total } =
    useSummary();
  const fieldErrors = useFieldErrors();
  // invoice-integrity T16 (SCR-02): tax, discount and shipping are locked once issued.
  const { locked } = useEditorLocks();

  // F-04: the entered value is never silently corrected — parse the raw input as typed
  // (including "-" and letters) and let invoiceFormSchema reject it on save, rather than
  // stripping characters and defaulting an unparseable entry to 0.
  const handleNumericChange = (
    value: string,
    field: 'taxRate' | 'discount' | 'shipping'
  ) => {
    updateField(field, parseDecimalDraft(value));
  };

  const discountInput = useNumberDraft(discount, (raw) =>
    handleNumericChange(raw, 'discount')
  );
  const shippingInput = useNumberDraft(shipping, (raw) =>
    handleNumericChange(raw, 'shipping')
  );
  const taxRateInput = useNumberDraft(taxRate, (raw) =>
    handleNumericChange(raw, 'taxRate')
  );

  const taxableAmount = subtotal - discount + shipping;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4" />
          Summary
        </CardTitle>

        <CardDescription>
          Review and adjust the invoice summary details
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">
            {formatMoney(subtotal, currency)}
          </span>
        </div>
        <FieldError errors={fieldErrors?.subtotal?.map((message) => ({ message }))} />

        <Separator aria-hidden="true" className="my-3" />

        <div className="bg-muted/50 space-y-3 rounded-lg p-3">
          <p className="text-muted-foreground text-xs font-medium">
            Adjustments
          </p>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor={`${fieldId}-discount`} className="text-muted-foreground">
              Discount
            </Label>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">−</span>
              <AmountInput
                value={discountInput.value}
                onChange={discountInput.onChange}
                className="h-8 w-24 text-right"
                id={`${fieldId}-discount`}
                disabled={locked}
                aria-invalid={!!fieldErrors?.discount}
                aria-describedby={fieldErrors?.discount ? `${fieldId}-discount-error` : undefined}
              />
              <span className="text-muted-foreground w-12">{currency}</span>
            </div>
          </div>
          <FieldError
            id={`${fieldId}-discount-error`}
            errors={fieldErrors?.discount?.map((message) => ({ message }))}
          />

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor={`${fieldId}-shipping`} className="text-muted-foreground">
              Shipping
            </Label>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">+</span>
              <AmountInput
                value={shippingInput.value}
                onChange={shippingInput.onChange}
                className="h-8 w-24 text-right"
                id={`${fieldId}-shipping`}
                disabled={locked}
                aria-invalid={!!fieldErrors?.shipping}
                aria-describedby={fieldErrors?.shipping ? `${fieldId}-shipping-error` : undefined}
              />
              <span className="text-muted-foreground w-12">{currency}</span>
            </div>
          </div>
          <FieldError
            id={`${fieldId}-shipping-error`}
            errors={fieldErrors?.shipping?.map((message) => ({ message }))}
          />

          <Separator aria-hidden="true" className="my-2" />

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm font-medium">
              Taxable Amount
            </span>
            <span className="font-medium">
              {formatMoney(taxableAmount, currency)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor={`${fieldId}-tax-rate`} className="text-muted-foreground">
              Tax
            </Label>
            <div className="flex items-center">
              <AmountInput
                value={taxRateInput.value}
                onChange={taxRateInput.onChange}
                className="h-8 w-16 text-right"
                id={`${fieldId}-tax-rate`}
                disabled={locked}
                aria-invalid={!!fieldErrors?.taxRate}
                aria-describedby={fieldErrors?.taxRate ? `${fieldId}-tax-rate-error` : undefined}
              />
              <span className="text-muted-foreground ml-1">%</span>
            </div>
          </div>

          <span className="font-medium">
            {formatMoney(taxAmount, currency)}
          </span>
        </div>
        <FieldError errors={fieldErrors?.taxAmount?.map((message) => ({ message }))} />
        <FieldError
          id={`${fieldId}-tax-rate-error`}
          errors={fieldErrors?.taxRate?.map((message) => ({ message }))}
        />

        <Separator aria-hidden="true" />

        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold">Total</span>
          <span className="text-xl font-bold">
            {formatMoney(total, currency)}
          </span>
        </div>
        <FieldError errors={fieldErrors?.total?.map((message) => ({ message }))} />
      </CardContent>
    </Card>
  );
}
