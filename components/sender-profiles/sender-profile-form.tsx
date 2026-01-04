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
  senderProfileFormSchema,
  SenderProfileFormValues,
} from '@/lib/validations/sender-profile';
import {
  createSenderProfile,
  updateSenderProfile,
} from '@/lib/actions/sender-profile-actions';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { protectedRoutes } from '@/config/routes.config';

interface SenderProfileFormProps {
  defaultValues?: SenderProfileFormValues & { id?: string };
  isEditing?: boolean;
}

export function SenderProfileForm({
  defaultValues,
  isEditing = false,
}: SenderProfileFormProps) {
  const router = useRouter();

  const form = useForm<SenderProfileFormValues>({
    resolver: zodResolver(senderProfileFormSchema),
    defaultValues: defaultValues || {
      name: '',
      legalName: '',
      taxId: '',
      address: '',
      city: '',
      country: '',
      postalCode: '',
      phone: '',
      email: '',
      website: '',
      logo: '',
      invoicePrefix: '',
      isDefault: false,
    },
  });

  const onSubmit = async (data: SenderProfileFormValues) => {
    try {
      const result =
        isEditing && defaultValues?.id
          ? await updateSenderProfile(defaultValues.id, data)
          : await createSenderProfile(data);

      if (!result.success) {
        toast.error(result.error || 'Failed to save sender profile');

        if (result.error?.includes('This invoice prefix is already in use.')) {
          form.setError('invoicePrefix', {
            message: result.error,
          });
        }

        return;
      }

      if (isEditing) {
        toast.success('Sender profile updated successfully');
        router.push(protectedRoutes.senderProfiles);
      }

      if (!isEditing && result.data?.id) {
        toast.success(
          'Sender profile created! Now add your first bank account'
        );

        router.push(
          protectedRoutes.senderProfileEditBankAccounts(result.data.id)
        );

        router.refresh();
      }
    } catch {
      toast.error('Failed to save sender profile');
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Main details about your company or individual profile
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sender-form-name">
                  Name <span className="text-destructive">*</span>
                </FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="sender-form-name"
                  aria-invalid={fieldState.invalid}
                  placeholder="My Company Ltd."
                />

                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            name="legalName"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sender-form-legal-name">
                  Legal Name
                </FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="sender-form-legal-name"
                  aria-invalid={fieldState.invalid}
                  placeholder="My Company Limited Liability Company"
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
                <FieldLabel htmlFor="sender-form-tax-id">
                  Tax ID / EDRPOU / INN
                </FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="sender-form-tax-id"
                  aria-invalid={fieldState.invalid}
                  placeholder="1234567890"
                />

                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <Controller
            name="invoicePrefix"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sender-form-invoice-prefix">
                  Invoice Prefix <span className="text-destructive">*</span>
                </FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="sender-form-invoice-prefix"
                  aria-invalid={fieldState.invalid}
                  placeholder="INV"
                  maxLength={10}
                  className="uppercase"
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                />

                <FieldError errors={[fieldState.error]} />

                <FieldDescription>
                  Unique prefix for invoice numbering (e.g., INV, FOP-01)
                </FieldDescription>
              </Field>
            )}
          />

          <Controller
            name="isDefault"
            control={form.control}
            render={({ field }) => (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sender-form-is-default"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />

                <Label
                  htmlFor="sender-form-is-default"
                  className="text-sm font-normal cursor-pointer"
                >
                  Set as default sender profile
                </Label>
              </div>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
          <CardDescription>How customers can reach you</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sender-form-email">Email</FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="sender-form-email"
                  type="email"
                  aria-invalid={fieldState.invalid}
                  placeholder="contact@company.com"
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
                <FieldLabel htmlFor="sender-form-phone">Phone</FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="sender-form-phone"
                  type="tel"
                  aria-invalid={fieldState.invalid}
                  placeholder="+X(XXX)XXX-XXXX"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="website"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sender-form-website">Website</FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="sender-form-website"
                  type="url"
                  aria-invalid={fieldState.invalid}
                  placeholder="https://company.com"
                />

                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
          <CardDescription>Your business location</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <Controller
            name="address"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sender-form-address">
                  Street Address
                </FieldLabel>

                <Textarea
                  {...field}
                  value={field.value ?? ''}
                  id="sender-form-address"
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
                <FieldLabel htmlFor="sender-form-city">City</FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="sender-form-city"
                  aria-invalid={fieldState.invalid}
                  placeholder="Kyiv"
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
                <FieldLabel htmlFor="sender-form-postal-code">
                  Postal Code
                </FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="sender-form-postal-code"
                  aria-invalid={fieldState.invalid}
                  placeholder="01001"
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
                <FieldLabel htmlFor="sender-form-country">Country</FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="sender-form-country"
                  aria-invalid={fieldState.invalid}
                  placeholder="Ukraine"
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
          <CardDescription>Customize your invoice appearance</CardDescription>
        </CardHeader>

        <CardContent>
          <Controller
            name="logo"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sender-form-logo">Logo URL</FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="sender-form-logo"
                  type="url"
                  aria-invalid={fieldState.invalid}
                  placeholder="https://example.com/logo.png"
                />

                <FieldError errors={[fieldState.error]} />

                <FieldDescription>
                  Enter a URL to your company logo (will appear on invoices)
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
            ? 'Update Profile'
            : 'Create Profile'}
        </Button>
      </div>
    </form>
  );
}
