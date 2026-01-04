'use client';

import { toast } from 'sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import {
  customerFormSchema,
  CustomerFormValues,
} from '@/lib/validations/customer';
import { createCustomer, updateCustomer } from '@/lib/actions/customer-actions';
import { protectedRoutes } from '@/config/routes.config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CURRENCY_OPTIONS } from '@/constants/currency-options';
import { Currency } from '@prisma/client';

interface CustomerFormProps {
  defaultValues?: CustomerFormValues & { id?: string };
  isEditing?: boolean;
}

export function CustomerForm({
  defaultValues,
  isEditing = false,
}: CustomerFormProps) {
  const router = useRouter();

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: defaultValues || {
      name: '',
      companyName: '',
      taxId: '',
      email: '',
      phone: '',
      website: '',
      image: '',
      address: '',
      city: '',
      country: '',
      postalCode: '',
      defaultCurrency: Currency.USD,
      notes: '',
    },
  });

  const onSubmit = async (data: CustomerFormValues) => {
    try {
      const result =
        isEditing && defaultValues?.id
          ? await updateCustomer(defaultValues.id, data)
          : await createCustomer(data);

      if (!result.success) {
        toast.error(result.error || 'Failed to save customer');
        return;
      }

      toast.success(
        `Customer ${isEditing ? 'updated' : 'created'} successfully`
      );
      router.push(protectedRoutes.customers);
      router.refresh();
    } catch {
      toast.error('Failed to save customer');
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Main details about your customer or client
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="customer-form-name">
                  Contact Name <span className="text-destructive">*</span>
                </FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="customer-form-name"
                  aria-invalid={fieldState.invalid}
                  placeholder="John Doe"
                />

                <FieldError errors={[fieldState.error]} />
                <FieldDescription>Primary contact person name</FieldDescription>
              </Field>
            )}
          />

          <Controller
            name="companyName"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="customer-form-company-name">
                  Company Name
                </FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="customer-form-company-name"
                  aria-invalid={fieldState.invalid}
                  placeholder="Acme Corporation"
                />

                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            name="taxId"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="customer-form-tax-id">
                  Tax ID / VAT Number
                </FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="customer-form-tax-id"
                  aria-invalid={fieldState.invalid}
                  placeholder="1234567890"
                />

                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            name="defaultCurrency"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="customer-form-currency">
                  Default Currency <span className="text-destructive">*</span>
                </FieldLabel>

                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={form.formState.isSubmitting}
                >
                  <SelectTrigger
                    id="customer-form-currency"
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue />
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
                <FieldDescription>
                  Preferred currency for invoices
                </FieldDescription>
              </Field>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
          <CardDescription>How to reach this customer</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="customer-form-email">Email</FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="customer-form-email"
                  type="email"
                  aria-invalid={fieldState.invalid}
                  placeholder="john@acme.com"
                />

                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            name="phone"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="customer-form-phone">Phone</FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="customer-form-phone"
                  type="tel"
                  aria-invalid={fieldState.invalid}
                  placeholder="+X(XXX)XXX-XXXX"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            name="website"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="customer-form-website">Website</FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="customer-form-website"
                  type="url"
                  aria-invalid={fieldState.invalid}
                  placeholder="https://example.com"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Logo or profile image</CardDescription>
        </CardHeader>

        <CardContent>
          <Controller
            name="image"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="customer-form-image">Image URL</FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="customer-form-image"
                  type="url"
                  aria-invalid={fieldState.invalid}
                  placeholder="https://example.com/logo.png"
                />

                <FieldError errors={[fieldState.error]} />

                <FieldDescription>
                  Enter a URL to customer logo or profile image
                </FieldDescription>
              </Field>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
          <CardDescription>Customer billing address</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <Controller
            name="address"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="customer-form-address">
                  Street Address
                </FieldLabel>

                <Textarea
                  {...field}
                  value={field.value ?? ''}
                  id="customer-form-address"
                  aria-invalid={fieldState.invalid}
                  placeholder="123 Main Street, Suite 100"
                  rows={3}
                />

                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            name="city"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="customer-form-city">City</FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="customer-form-city"
                  aria-invalid={fieldState.invalid}
                  placeholder="New York"
                />

                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            name="postalCode"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="customer-form-postal-code">
                  Postal Code
                </FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="customer-form-postal-code"
                  aria-invalid={fieldState.invalid}
                  placeholder="10001"
                />

                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            name="country"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="customer-form-country">Country</FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="customer-form-country"
                  aria-invalid={fieldState.invalid}
                  placeholder="United States"
                />

                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
          <CardDescription>Notes and other details</CardDescription>
        </CardHeader>

        <CardContent>
          <Controller
            name="notes"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="customer-form-notes">Notes</FieldLabel>

                <Textarea
                  {...field}
                  value={field.value ?? ''}
                  id="customer-form-notes"
                  aria-invalid={fieldState.invalid}
                  placeholder="Any additional notes about this customer..."
                  rows={4}
                />

                <FieldError errors={[fieldState.error]} />
                <FieldDescription>
                  Internal notes (not visible to customer)
                </FieldDescription>
              </Field>
            )}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={form.formState.isSubmitting}
        >
          Cancel
        </Button>

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spinner className="mr-2" />}
          {form.formState.isSubmitting
            ? 'Saving...'
            : isEditing
            ? 'Update Customer'
            : 'Create Customer'}
        </Button>
      </div>
    </form>
  );
}
