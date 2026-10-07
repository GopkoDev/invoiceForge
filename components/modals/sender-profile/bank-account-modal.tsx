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
  FieldDescription,
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
import type { BankAccountSubmitOutcome } from '@/lib/helpers/bank-account-modal-helpers';

export interface BankAccountModalProps {
  open: boolean;
  close: () => void;
  /** Resolves with the outcome; `saved: false` keeps the dialog open (field errors are shown). */
  onFormSubmit: (
    data: BankAccountFormValues,
    isEditing: boolean
  ) => Promise<BankAccountSubmitOutcome | void>;
  senderProfileId: string;
  defaultValues?: BankAccountFormValues;
  isEditing?: boolean;
  /** The sender profile has no account yet: this one becomes its default (AC-17b). */
  isFirst?: boolean;
}

// invoice-integrity T19 (SCR-10): the default account can only be replaced by making another account
// the default, so the checkbox is fixed for a first or the current default account.
const FIRST_DEFAULT_TEXT = 'The first account of a sender profile is its default.';
const CURRENT_DEFAULT_TEXT = 'This is the default account. To change it, make another account the default.';

export function BankAccountModal({
  open,
  close,
  onFormSubmit,
  defaultValues,
  isEditing = false,
  isFirst = false,
}: BankAccountModalProps) {
  const isFirstAccount = !isEditing && isFirst;
  const isCurrentDefault = isEditing && !!defaultValues?.isDefault;
  const form = useForm<BankAccountFormValues>({
    resolver: zodResolver(bankAccountFormSchema),
    defaultValues: defaultValues || {
      bankName: '',
      accountName: '',
      accountNumber: '',
      iban: '',
      swift: '',
      currency: Currency.USD,
      isDefault: isFirstAccount,
    },
  });

  const onSubmit = async (data: BankAccountFormValues) => {
    const outcome = await onFormSubmit(data, isEditing);
    // A refusal keeps the dialog open with every value: a currency used by invoices (HAS_INVOICES)
    // or a refused unset shows under its field, a default race was toasted (SCR-10).
    if (outcome && !outcome.saved) {
      for (const [name, messages] of Object.entries(outcome.fieldErrors ?? {})) {
        if (messages[0]) form.setError(name as keyof BankAccountFormValues, { message: messages[0] });
      }
      return;
    }
    close();
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
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
                    value={field.value ?? ''}
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
                    value={field.value ?? ''}
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
                  value={field.value ?? ''}
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
                    value={field.value ?? ''}
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
                    value={field.value ?? ''}
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
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="bank-form-is-default"
                    checked={isFirstAccount || isCurrentDefault || field.value}
                    onCheckedChange={field.onChange}
                    disabled={isFirstAccount || isCurrentDefault}
                  />

                  <Label
                    htmlFor="bank-form-is-default"
                    className="cursor-pointer text-sm font-normal"
                  >
                    Set as default bank account for this sender profile
                  </Label>
                </div>
                {(isFirstAccount || isCurrentDefault) && (
                  <FieldDescription>
                    {isFirstAccount ? FIRST_DEFAULT_TEXT : CURRENT_DEFAULT_TEXT}
                  </FieldDescription>
                )}
                <FieldError errors={[fieldState.error]} />
              </Field>
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
