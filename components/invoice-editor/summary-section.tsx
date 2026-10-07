'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FieldError } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
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
            {subtotal.toFixed(2)} {currency}
          </span>
        </div>

        <Separator className="my-3" />

        <div className="bg-muted/50 space-y-3 rounded-lg p-3">
          <p className="text-muted-foreground text-xs font-medium">
            Adjustments
          </p>

          <div className="flex items-center justify-between gap-4">
            <Label className="text-muted-foreground">Discount</Label>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">−</span>
              <Input
                type="text"
                value={discountInput.value}
                onChange={(e) => discountInput.onChange(e.target.value)}
                className="h-8 w-24 text-right"
                disabled={locked}
                aria-invalid={!!fieldErrors?.discount}
              />
              <span className="text-muted-foreground w-12">{currency}</span>
            </div>
          </div>
          <FieldError
            errors={fieldErrors?.discount?.map((message) => ({ message }))}
          />

          <div className="flex items-center justify-between gap-4">
            <Label className="text-muted-foreground">Shipping</Label>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">+</span>
              <Input
                type="text"
                value={shippingInput.value}
                onChange={(e) => shippingInput.onChange(e.target.value)}
                className="h-8 w-24 text-right"
                disabled={locked}
                aria-invalid={!!fieldErrors?.shipping}
              />
              <span className="text-muted-foreground w-12">{currency}</span>
            </div>
          </div>
          <FieldError
            errors={fieldErrors?.shipping?.map((message) => ({ message }))}
          />

          <Separator className="my-2" />

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm font-medium">
              Taxable Amount
            </span>
            <span className="font-medium">
              {taxableAmount.toFixed(2)} {currency}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Tax</span>
            <div className="flex items-center">
              <Input
                type="text"
                value={taxRateInput.value}
                onChange={(e) => taxRateInput.onChange(e.target.value)}
                className="h-8 w-16 text-right"
                disabled={locked}
                aria-invalid={!!fieldErrors?.taxRate}
              />
              <span className="text-muted-foreground ml-1">%</span>
            </div>
          </div>

          <span className="font-medium">
            {taxAmount.toFixed(2)} {currency}
          </span>
        </div>
        <FieldError
          errors={fieldErrors?.taxRate?.map((message) => ({ message }))}
        />

        <Separator />

        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold">Total</span>
          <span className="text-xl font-bold">
            {total.toFixed(2)} {currency}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
