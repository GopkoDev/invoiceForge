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
import { Separator } from '@/components/ui/separator';
import { Calculator } from 'lucide-react';
import {
  useSummary,
  useInvoiceCurrency,
  useInvoiceEditorActions,
} from '@/store/invoice-editor-store';

export function SummarySection() {
  const currency = useInvoiceCurrency();
  const { updateField } = useInvoiceEditorActions();
  const { subtotal, taxRate, taxAmount, discount, shipping, total } =
    useSummary();

  const handleNumericChange = (
    value: string,
    field: 'taxRate' | 'discount' | 'shipping'
  ) => {
    const sanitized = value.replace(/[^\d.]/g, '');
    updateField(field, parseFloat(sanitized) || 0);
  };

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
                value={discount}
                onChange={(e) =>
                  handleNumericChange(e.target.value, 'discount')
                }
                className="h-8 w-24 text-right"
              />
              <span className="text-muted-foreground w-12">{currency}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label className="text-muted-foreground">Shipping</Label>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">+</span>
              <Input
                type="text"
                value={shipping}
                onChange={(e) =>
                  handleNumericChange(e.target.value, 'shipping')
                }
                className="h-8 w-24 text-right"
              />
              <span className="text-muted-foreground w-12">{currency}</span>
            </div>
          </div>

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
                value={taxRate}
                onChange={(e) => handleNumericChange(e.target.value, 'taxRate')}
                className="h-8 w-16 text-right"
              />
              <span className="text-muted-foreground ml-1">%</span>
            </div>
          </div>

          <span className="font-medium">
            {taxAmount.toFixed(2)} {currency}
          </span>
        </div>

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
