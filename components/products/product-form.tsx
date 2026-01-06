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
  productFormSchema,
  ProductFormValues,
} from '@/lib/validations/product';
import { createProduct, updateProduct } from '@/lib/actions/product-actions';
import { getProductCustomPrices } from '@/lib/actions/custom-price-actions';
import { protectedRoutes } from '@/config/routes.config';
import { useModal } from '@/store/use-modal-store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CURRENCY_OPTIONS } from '@/constants/currency-options';
import { UNIT_OPTIONS } from '@/constants/unit-options';
import { Currency } from '@prisma/client';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoIcon, LockIcon } from 'lucide-react';

interface ProductFormProps {
  defaultValues?: ProductFormValues & { id?: string };
  isEditing?: boolean;
  invoiceItemsCount?: number;
  customPricesCount?: number;
}

export function ProductForm({
  defaultValues,
  isEditing = false,
  invoiceItemsCount = 0,
  customPricesCount = 0,
}: ProductFormProps) {
  const router = useRouter();
  const isUsedInInvoices = isEditing && invoiceItemsCount > 0;
  const currencyChangeModal = useModal('currencyChangeWarningModal');

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: defaultValues || {
      name: '',
      description: '',
      unit: 'hours',
      price: '',
      currency: Currency.USD,
      isActive: true,
    },
  });

  const handleUpdate = async (data: ProductFormValues) => {
    if (!defaultValues?.id) return;

    const result = await updateProduct(defaultValues.id, data);

    if (!result.success) {
      toast.error(result.error || 'Failed to update product');
      return;
    }

    toast.success('Product updated successfully');
    router.push(protectedRoutes.products);
    router.refresh();
  };

  const onSubmit = async (data: ProductFormValues) => {
    try {
      if (!isEditing) {
        const result = await createProduct(data);
        if (!result.success) {
          toast.error(result.error || 'Failed to create product');
          return;
        }
        toast.success('Product created successfully');
        router.push(protectedRoutes.products);
        router.refresh();
        return;
      }

      if (!defaultValues?.id) return;

      const currencyChanged = defaultValues.currency !== data.currency;
      if (currencyChanged && customPricesCount > 0) {
        const customPricesResult = await getProductCustomPrices(
          defaultValues.id
        );

        if (!customPricesResult.success || !customPricesResult.data) {
          toast.error('Failed to load custom prices');
          return;
        }

        const customersAffected = customPricesResult.data.map((cp) => ({
          customerId: cp.customer.id,
          customerName: cp.customer.name,
          price: cp.price,
        }));

        currencyChangeModal.open({
          open: true,
          onClose: currencyChangeModal.close,
          onConfirm: async () => {
            currencyChangeModal.close();
            await handleUpdate(data);
          },
          oldCurrency: defaultValues.currency,
          newCurrency: data.currency,
          customersAffected,
        });

        return;
      }

      await handleUpdate(data);
    } catch {
      toast.error('Failed to save product');
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {!isEditing && (
        <Alert>
          <InfoIcon />
          <AlertTitle>Important: Currency and Unit Settings</AlertTitle>
          <AlertDescription>
            Once this product is used in invoices, you won&apos;t be able to
            change the currency or unit of measure. Choose carefully to maintain
            consistency in your invoicing.
          </AlertDescription>
        </Alert>
      )}

      {isUsedInInvoices && (
        <Alert>
          <LockIcon />
          <AlertTitle>Currency and Unit Locked</AlertTitle>
          <AlertDescription>
            This product is used in {invoiceItemsCount} invoice
            {invoiceItemsCount > 1 ? 's' : ''}. Currency and unit of measure
            cannot be changed to maintain data consistency. Create a new product
            if you need different settings.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Product Information</CardTitle>
          <CardDescription>
            Basic details about your product or service
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="product-form-name">
                  Product Name <span className="text-destructive">*</span>
                </FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="product-form-name"
                  aria-invalid={fieldState.invalid}
                  placeholder="Web Development Service"
                />

                <FieldError errors={[fieldState.error]} />
                <FieldDescription>
                  Name that will appear on invoices
                </FieldDescription>
              </Field>
            )}
          />

          <Controller
            name="description"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="product-form-description">
                  Description
                </FieldLabel>

                <Textarea
                  {...field}
                  value={field.value ?? ''}
                  id="product-form-description"
                  aria-invalid={fieldState.invalid}
                  placeholder="Detailed description of the product or service..."
                  rows={4}
                />

                <FieldError errors={[fieldState.error]} />
                <FieldDescription>
                  Additional details about this product or service
                </FieldDescription>
              </Field>
            )}
          />

          <Controller
            name="isActive"
            control={form.control}
            render={({ field }) => (
              <Field>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <FieldLabel htmlFor="product-form-is-active">
                      Active Status
                    </FieldLabel>
                    <FieldDescription>
                      Inactive products won&apos;t appear when creating invoices
                    </FieldDescription>
                  </div>
                  <Switch
                    id="product-form-is-active"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={form.formState.isSubmitting}
                  />
                </div>
              </Field>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>Set the default price and unit</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Controller
              name="price"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="product-form-price">
                    Price <span className="text-destructive">*</span>
                  </FieldLabel>

                  <Input
                    {...field}
                    value={field.value ?? ''}
                    id="product-form-price"
                    type="number"
                    step="0.01"
                    min="0"
                    aria-invalid={fieldState.invalid}
                    placeholder="100.00"
                  />

                  <FieldError errors={[fieldState.error]} />
                  <FieldDescription>Default price per unit</FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="currency"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="product-form-currency">
                    Currency <span className="text-destructive">*</span>
                    {isUsedInInvoices && (
                      <LockIcon className="inline ml-1 h-4 w-4 text-muted-foreground" />
                    )}
                  </FieldLabel>

                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={form.formState.isSubmitting || isUsedInInvoices}
                  >
                    <SelectTrigger
                      id="product-form-currency"
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
                  {isUsedInInvoices && (
                    <FieldDescription className="text-amber-600 dark:text-amber-500">
                      Locked: Used in {invoiceItemsCount} invoice
                      {invoiceItemsCount > 1 ? 's' : ''}
                    </FieldDescription>
                  )}
                </Field>
              )}
            />
          </div>

          <Controller
            name="unit"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="product-form-unit">
                  Unit of Measure <span className="text-destructive">*</span>
                  {isUsedInInvoices && (
                    <LockIcon className="inline ml-1 h-4 w-4 text-muted-foreground" />
                  )}
                </FieldLabel>

                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={form.formState.isSubmitting || isUsedInInvoices}
                >
                  <SelectTrigger
                    id="product-form-unit"
                    aria-invalid={fieldState.invalid}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <FieldError errors={[fieldState.error]} />
                {isUsedInInvoices ? (
                  <FieldDescription className="text-amber-600 dark:text-amber-500">
                    Locked: Used in {invoiceItemsCount} invoice
                    {invoiceItemsCount > 1 ? 's' : ''}
                  </FieldDescription>
                ) : (
                  <FieldDescription>
                    How this product/service is measured (e.g., hours, pieces,
                    projects)
                  </FieldDescription>
                )}
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
            ? 'Update Product'
            : 'Create Product'}
        </Button>
      </div>
    </form>
  );
}
