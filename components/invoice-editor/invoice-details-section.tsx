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
import { FieldDescription, FieldError } from '@/components/ui/field';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { FileText, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// Import store selectors and actions
import {
  useInvoiceNumber,
  useInvoiceNumberHint,
  useFieldErrors,
  useInvoiceDates,
  useInvoiceCurrency,
  usePoNumber,
  useEditorLocks,
  useInvoiceEditorActions,
} from '@/store/invoice-editor-store';

const dueDatePresets = [
  { label: 'In 7 days', days: 7 },
  { label: 'In 14 days', days: 14 },
  { label: 'In 30 days', days: 30 },
  { label: 'In 60 days', days: 60 },
];

export function InvoiceDetailsSection() {
  const invoiceNumber = useInvoiceNumber();
  const invoiceNumberHint = useInvoiceNumberHint();
  const fieldErrors = useFieldErrors();
  const { issueDate, dueDate } = useInvoiceDates();
  const currency = useInvoiceCurrency();
  const poNumber = usePoNumber();

  const { updateField } = useInvoiceEditorActions();
  // invoice-integrity T16 (SCR-02): issued → only the due date and PO number here; cancelled → none.
  const { locked, readOnly } = useEditorLocks();

  const applyDueDatePreset = (days: number) => {
    const newDueDate = new Date(issueDate);
    newDueDate.setDate(newDueDate.getDate() + days);
    updateField('dueDate', newDueDate);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          Invoice Details
        </CardTitle>
        <CardDescription>
          Specify invoice number, dates, and PO number
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Invoice Number */}
          <div className="space-y-2">
            <Label>
              Invoice Number <span className="text-destructive">*</span>
            </Label>

            <Input
              value={invoiceNumber}
              onChange={(e) => updateField('invoiceNumber', e.target.value)}
              placeholder={invoiceNumberHint}
              disabled={locked}
              aria-invalid={!!fieldErrors?.invoiceNumber}
            />

            {/* An empty field is the only signal a number is system-proposed (AC-06); the hint
                is shown only as a placeholder, never merged into the value. */}
            {invoiceNumber === '' && (
              <FieldDescription>Assigned on save</FieldDescription>
            )}

            <FieldError
              errors={fieldErrors?.invoiceNumber?.map((message) => ({ message }))}
            />
          </div>

          {/* Currency (read-only, derived from bank account) */}
          <div className="space-y-2">
            <Label>Currency</Label>
            <Input
              value={currency}
              readOnly
              disabled
              className="bg-muted cursor-not-allowed"
            />
            <p className="text-muted-foreground text-xs">
              Currency is determined by the selected bank account
            </p>
          </div>

          {/* Issue Date */}
          <div className="space-y-2">
            <Label>Issue Date</Label>
            <Popover>
              <PopoverTrigger
                disabled={locked}
                className={cn(
                  'border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 mb-0 inline-flex h-9 w-full items-center justify-start gap-1.5 rounded-md border px-2.5 text-left text-sm font-normal shadow-xs',
                  !issueDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {issueDate
                  ? format(issueDate, 'PPP', { locale: enUS })
                  : 'Pick a date'}
              </PopoverTrigger>

              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={issueDate}
                  onSelect={(date) => date && updateField('issueDate', date)}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <Label>Due Date</Label>
            <Popover>
              <PopoverTrigger
                disabled={readOnly}
                className={cn(
                  'border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 mb-0 inline-flex h-9 w-full items-center justify-start gap-1.5 rounded-md border px-2.5 text-left text-sm font-normal shadow-xs',
                  !dueDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dueDate
                  ? format(dueDate, 'PPP', { locale: enUS })
                  : 'Pick a date'}
              </PopoverTrigger>

              <PopoverContent className="flex w-auto gap-0 p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={(date) => date && updateField('dueDate', date)}
                  initialFocus
                  className="pointer-events-auto"
                />

                <div className="grid grid-cols-2 gap-2 border-t p-3">
                  {dueDatePresets.map((preset) => (
                    <Button
                      key={preset.days}
                      variant="outline"
                      size="sm"
                      className="justify-start text-xs"
                      onClick={() => applyDueDatePreset(preset.days)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <FieldError errors={fieldErrors?.dueDate?.map((message) => ({ message }))} />
          </div>
        </div>

        {/* PO Number */}
        <div className="space-y-2">
          <Label>PO Number (optional)</Label>
          <Input
            value={poNumber}
            onChange={(e) => updateField('poNumber', e.target.value)}
            placeholder="Customer purchase order number"
            disabled={readOnly}
          />
        </div>
      </CardContent>
    </Card>
  );
}
