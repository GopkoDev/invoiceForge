'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller, useWatch } from 'react-hook-form';
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
  FieldLabel,
} from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import {
  customPriceSchema,
  CustomPriceSchemaValues,
} from '@/lib/validations/custom-price';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SerializedCustomPrice } from '@/types/custom-price/types';
import { SerializedProduct } from '@/types/product/types';
import { CustomerWithRelations } from '@/types/customer/types';
import { formatCurrency, getUnitLabel } from '@/lib/helpers/format-helpers';
import { ActionResult } from '@/types/actions';
import type { Currency } from '@prisma/client';

type SelectableItem = SerializedProduct | CustomerWithRelations;

function isProduct(item: SelectableItem): item is SerializedProduct {
  return 'price' in item && 'currency' in item && 'unit' in item;
}

export interface CustomPriceModalProps {
  open: boolean;
  close: () => void;
  /** Resolves with the server action's ActionResult — the modal owns success/failure UI. */
  onFormSubmit: (
    data: CustomPriceSchemaValues
  ) => Promise<ActionResult<unknown>>;
  defaultValues?: SerializedCustomPrice;
  isEditing?: boolean;
  mode: 'selectProduct' | 'selectCustomer';
  onLoadProducts: () => Promise<SelectableItem[]>;
  // Optional product info for selectCustomer mode (to display price/currency/unit)
  productInfo?: {
    price: number;
    currency: Currency;
    unit: string;
  };
  /** Create from a Customer's page (SCR-10): the Customer is fixed, the Freelancer picks a product. */
  fixedCustomerId?: string;
  /** Create from a Product's page (SCR-09): the product is fixed, the Freelancer picks a Customer. */
  fixedProductId?: string;
  successMessage?: string;
}

export function CustomPriceModal({
  open,
  close,
  onFormSubmit,
  defaultValues,
  isEditing = false,
  mode = 'selectProduct',
  onLoadProducts,
  productInfo,
  fixedCustomerId,
  fixedProductId,
  successMessage,
}: CustomPriceModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [availableProducts, setAvailableProducts] = useState<SelectableItem[]>(
    []
  );
  const [notFoundError, setNotFoundError] = useState<string | null>(null);

  // In selectProduct mode the Freelancer picks the product (customerId is fixed by context);
  // in selectCustomer mode the Freelancer picks the Customer (productId is fixed by context).
  const pickedFieldName = mode === 'selectProduct' ? 'productId' : 'customerId';

  const form = useForm<CustomPriceSchemaValues>({
    resolver: zodResolver(customPriceSchema),
    defaultValues: defaultValues
      ? {
          customerId: defaultValues.customerId,
          productId: defaultValues.productId,
          name: defaultValues.name ?? '',
          price: defaultValues.price,
          notes: defaultValues.notes ?? '',
        }
      : {
          customerId: fixedCustomerId ?? '',
          productId: fixedProductId ?? '',
          name: '',
          price: 0,
          notes: '',
        },
  });

  const handleSelectOpen = async (isOpen: boolean) => {
    if (isOpen && availableProducts.length === 0 && onLoadProducts) {
      setIsLoading(true);
      try {
        const products = await onLoadProducts();
        setAvailableProducts(products);
      } catch (error) {
        console.error('Failed to load products:', error);
        setAvailableProducts([]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleProductChange = (id: string | null) => {
    if (!id) return;
    form.setValue(pickedFieldName, id);
    const item = availableProducts.find((p) => p.id === id);
    if (item && !form.getValues('price')) {
      const price = isProduct(item) ? item.price : productInfo?.price ?? 0;
      form.setValue('price', price);
    }
  };

  const pickedId = useWatch({ control: form.control, name: pickedFieldName });
  const selectedItem = availableProducts.find((p) => p.id === pickedId);
  const defaultProduct: SelectableItem | undefined = isEditing
    ? (defaultValues?.product as SelectableItem | undefined)
    : selectedItem;

  const onSubmit = async (data: CustomPriceSchemaValues) => {
    setNotFoundError(null);
    const result = await onFormSubmit(data);

    if (result.success) {
      toast.success(
        successMessage ||
          (isEditing
            ? 'Custom price updated successfully'
            : 'Custom price created successfully')
      );
      handleClose();
      return;
    }

    if (result.code === 'VALIDATION' && result.fieldErrors) {
      Object.entries(result.fieldErrors).forEach(([field, messages]) => {
        form.setError(field as keyof CustomPriceSchemaValues, {
          type: 'server',
          message: messages[0],
        });
      });
      return;
    }

    if (result.code === 'NOT_FOUND') {
      setNotFoundError(result.error);
      return;
    }

    toast.error(result.error || 'Failed to save custom price');
  };

  const handleClose = () => {
    form.reset();
    setIsLoading(false);
    setAvailableProducts([]);
    setNotFoundError(null);
    close();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Custom Price' : 'Add Custom Price'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Update custom pricing for ${
                  defaultValues?.product?.name ||
                  (mode === 'selectProduct' ? 'this product' : 'this customer')
                }`
              : mode === 'selectProduct'
              ? 'Set a special price for this customer'
              : 'Set a special price for this product'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {notFoundError && (
            <Alert variant="destructive">
              <AlertDescription>{notFoundError}</AlertDescription>
            </Alert>
          )}

          {!isEditing && (
            <Controller
              name={pickedFieldName}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="custom-price-form-product">
                    {mode === 'selectProduct' ? 'Product' : 'Customer'}{' '}
                    <span className="text-destructive">*</span>
                  </FieldLabel>

                  <Select
                    value={field.value}
                    onValueChange={handleProductChange}
                    onOpenChange={handleSelectOpen}
                    disabled={form.formState.isSubmitting || isLoading}
                  >
                    <SelectTrigger
                      id="custom-price-form-product"
                      aria-invalid={fieldState.invalid}
                    >
                      <SelectValue>
                        {field.value
                          ? (() => {
                              const item = availableProducts.find(
                                (p) => p.id === field.value
                              );
                              return item
                                ? isProduct(item)
                                  ? item.name
                                  : item.companyName || item.name
                                : '';
                            })()
                          : `Select ${
                              mode === 'selectProduct' ? 'product' : 'customer'
                            }`}
                      </SelectValue>
                    </SelectTrigger>

                    <SelectContent>
                      {isLoading ? (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                          <Spinner className="h-4 w-4" />
                          Loading...
                        </div>
                      ) : availableProducts.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          No{' '}
                          {mode === 'selectProduct' ? 'products' : 'customers'}{' '}
                          available
                        </div>
                      ) : (
                        availableProducts.map((item) => {
                          const displayName = isProduct(item)
                            ? item.name
                            : item.companyName || item.name;
                          const price = isProduct(item)
                            ? item.price
                            : productInfo?.price ?? 0;
                          const currency = isProduct(item)
                            ? item.currency
                            : productInfo?.currency;
                          const unit = isProduct(item)
                            ? item.unit
                            : productInfo?.unit ?? '';

                          return (
                            <SelectItem key={item.id} value={item.id}>
                              <div className="flex flex-col">
                                <span>{displayName}</span>
                                {currency && (
                                  <span className="text-xs text-muted-foreground">
                                    Default: {formatCurrency(price, currency)}
                                    {unit && ` per ${getUnitLabel(unit)}`}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>

                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          )}

          {isEditing && defaultValues?.product && defaultValues?.customer && (
            <div className="p-3 rounded-md bg-muted">
              <div className="text-xs font-medium text-muted-foreground uppercase">
                {mode === 'selectProduct' ? 'Product' : 'Customer'}
              </div>
              <div className="text-sm font-medium">
                {mode === 'selectProduct'
                  ? defaultValues.product.name
                  : defaultValues.customer.companyName ||
                    defaultValues.customer.name}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Currency is inherited from the product
              </div>
            </div>
          )}

          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="custom-price-form-name">
                  Label / Name
                </FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="custom-price-form-name"
                  aria-invalid={fieldState.invalid}
                  placeholder="e.g. Wholesale, Winter discount, Special rate"
                  disabled={form.formState.isSubmitting}
                />

                <FieldError errors={[fieldState.error]} />

                <FieldDescription>
                  Optional label to identify this price (useful when having
                  multiple prices)
                </FieldDescription>
              </Field>
            )}
          />

          <Controller
            name="price"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="custom-price-form-price">
                  Custom Price <span className="text-destructive">*</span>
                </FieldLabel>

                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="custom-price-form-price"
                  type="text"
                  aria-invalid={fieldState.invalid}
                  placeholder="0.00"
                  disabled={form.formState.isSubmitting}
                  // F-04: the entered value is never silently corrected — pass it through as
                  // typed (including "-" and letters) and let customPriceSchema's zod coercion
                  // reject it with the contract's field message.
                  onChange={(e) => field.onChange(e.target.value)}
                />

                <FieldError errors={[fieldState.error]} />

                {defaultProduct && (
                  <FieldDescription>
                    Default:{' '}
                    {formatCurrency(
                      isProduct(defaultProduct)
                        ? defaultProduct.price
                        : productInfo?.price ?? 0,
                      isProduct(defaultProduct)
                        ? defaultProduct.currency
                        : productInfo?.currency ?? 'USD'
                    )}{' '}
                    per{' '}
                    {getUnitLabel(
                      isProduct(defaultProduct)
                        ? defaultProduct.unit
                        : productInfo?.unit ?? ''
                    )}
                  </FieldDescription>
                )}
              </Field>
            )}
          />

          <Controller
            name="notes"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="custom-price-form-notes">Notes</FieldLabel>

                <Textarea
                  {...field}
                  value={field.value ?? ''}
                  id="custom-price-form-notes"
                  aria-invalid={fieldState.invalid}
                  placeholder="Reason for special pricing, discount details, etc."
                  rows={3}
                  disabled={form.formState.isSubmitting}
                />

                <FieldError errors={[fieldState.error]} />

                <FieldDescription>
                  Optional notes about this custom price
                </FieldDescription>
              </Field>
            )}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
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
