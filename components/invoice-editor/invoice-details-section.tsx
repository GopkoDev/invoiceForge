'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FileText, CalendarIcon, Lock, Unlock, Car } from 'lucide-react';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';

// Import store selectors and actions
import {
  useInvoiceNumber,
  useInvoiceDates,
  useInvoiceCurrency,
  usePoNumber,
  useInvoiceEditorActions,
} from '@/store/invoice-editor-store';

const dueDatePresets = [
  { label: 'In 7 days', days: 7 },
  { label: 'In 14 days', days: 14 },
  { label: 'In 30 days', days: 30 },
  { label: 'In 60 days', days: 60 },
];

export function InvoiceDetailsSection() {
  const [isInvoiceNumberLocked, setIsInvoiceNumberLocked] = useState(true);

  const invoiceNumber = useInvoiceNumber();
  const { issueDate, dueDate } = useInvoiceDates();
  const currency = useInvoiceCurrency();
  const poNumber = usePoNumber();

  const { updateField } = useInvoiceEditorActions();

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

            <div className="flex gap-2">
              <Input
                value={invoiceNumber}
                onChange={(e) => updateField('invoiceNumber', e.target.value)}
                placeholder="INV-2024-0001"
                disabled={isInvoiceNumberLocked}
                className={cn(
                  isInvoiceNumberLocked && 'bg-muted cursor-not-allowed'
                )}
              />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setIsInvoiceNumberLocked(!isInvoiceNumberLocked)
                      }
                    >
                      {isInvoiceNumberLocked ? (
                        <Lock className="h-4 w-4" />
                      ) : (
                        <Unlock className="h-4 w-4" />
                      )}
                    </Button>
                  }
                />

                <TooltipContent>
                  {isInvoiceNumberLocked
                    ? 'Unlock to edit invoice number'
                    : 'Lock invoice number'}
                </TooltipContent>
              </Tooltip>
            </div>

            {isInvoiceNumberLocked && (
              <p className="text-muted-foreground text-xs">
                Auto-generated. Click the lock to edit manually.
              </p>
            )}
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
          </div>
        </div>

        {/* PO Number */}
        <div className="space-y-2">
          <Label>PO Number (optional)</Label>
          <Input
            value={poNumber}
            onChange={(e) => updateField('poNumber', e.target.value)}
            placeholder="Customer purchase order number"
          />
        </div>
      </CardContent>
    </Card>
  );
}
