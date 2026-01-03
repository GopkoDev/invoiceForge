'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  bankAccountFormSchema,
  BankAccountFormValues,
} from '@/lib/validations/bank-account';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Currency } from '@prisma/client';
import { CURRENCY_OPTIONS } from '@/constants/currency-options';

export interface BankAccountModalProps {
  open: boolean;
  close: () => void;
  onFormSubmit: (
    data: BankAccountFormValues,
    isEditing: boolean
  ) => Promise<void>;
  senderProfileId: string;
  defaultValues?: BankAccountFormValues;
  isEditing?: boolean;
}

export function BankAccountModal({
  open,
  close,
  onFormSubmit,
  defaultValues,
  isEditing = false,
}: BankAccountModalProps) {
  const form = useForm<BankAccountFormValues>({
    resolver: zodResolver(bankAccountFormSchema),
    defaultValues: defaultValues || {
      bankName: '',
      accountName: '',
      accountNumber: '',
      iban: '',
      swift: '',
      currency: Currency.USD,
      isDefault: false,
    },
  });

  const onSubmit = async (data: BankAccountFormValues) => {
    await onFormSubmit(data, isEditing);
    close();
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Bank Account' : 'Add Bank Account'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update bank account information'
              : 'Add a new bank account for this sender profile'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FieldGroup>
            <Controller
              name="bankName"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="bank-form-name">
                    Bank Name <span className="text-destructive">*</span>
                  </FieldLabel>

                  <Input
                    {...field}
                    id="bank-form-name"
                    aria-invalid={fieldState.invalid}
                    placeholder="PrivatBank"
                  />

                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              name="accountName"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="bank-form-account-name">
                    Account Holder Name{' '}
                    <span className="text-destructive">*</span>
                  </FieldLabel>

                  <Input
                    {...field}
                    id="bank-form-account-name"
                    aria-invalid={fieldState.invalid}
                    placeholder="Company Name LLC"
                  />

                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>

          <Controller
            name="accountNumber"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="bank-form-account-number">
                  Account Number <span className="text-destructive">*</span>
                </FieldLabel>

                <Input
                  {...field}
                  id="bank-form-account-number"
                  aria-invalid={fieldState.invalid}
                  placeholder="1234567890123456"
                />

                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <FieldGroup>
            <Controller
              name="iban"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="bank-form-iban">IBAN</FieldLabel>

                  <Input
                    {...field}
                    id="bank-form-iban"
                    aria-invalid={fieldState.invalid}
                    placeholder="UA123456789012345678901234567"
                  />

                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <Controller
              name="swift"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="bank-form-swift">SWIFT / BIC</FieldLabel>

                  <Input
                    {...field}
                    id="bank-form-swift"
                    aria-invalid={fieldState.invalid}
                    placeholder="PBANUA2X"
                    maxLength={11}
                  />

                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>

          <Controller
            name="currency"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="bank-form-currency">
                  Currency <span className="text-destructive">*</span>
                </FieldLabel>

                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="bank-form-currency">
                    <SelectValue>
                      {field.value || 'Select currency'}
                    </SelectValue>
                  </SelectTrigger>

                  <SelectContent>
                    {CURRENCY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            name="isDefault"
            control={form.control}
            render={({ field }) => (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="bank-form-is-default"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />

                <Label
                  htmlFor="bank-form-is-default"
                  className="text-sm font-normal cursor-pointer"
                >
                  Set as default bank account for this sender profile
                </Label>
              </div>
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                form.reset();
                close();
              }}
              disabled={form.formState.isSubmitting}
            >
              Cancel
            </Button>

            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner className="mr-2" />}
              {form.formState.isSubmitting
                ? 'Saving...'
                : isEditing
                ? 'Update'
                : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
