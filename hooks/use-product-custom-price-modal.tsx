'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { useModal } from '@/store/use-modal-store';
import { createCustomPrice } from '@/lib/actions/custom-price-actions';
import { getCustomers } from '@/lib/actions/customer-actions';
import type { CustomPriceFormValues } from '@/lib/validations/custom-price';
import type { Currency } from '@prisma/client';

interface UseProductCustomPriceModalParams {
  productId: string;
  productPrice: number;
  productCurrency: Currency;
  productUnit: string;
}

export function useProductCustomPriceModal({
  productId,
  productPrice,
  productCurrency,
  productUnit,
}: UseProductCustomPriceModalParams) {
  const customPriceModal = useModal('customPriceModal');

  const handleAddCustomPrice = useCallback(() => {
    customPriceModal.open({
      open: true,
      close: customPriceModal.close,
      mode: 'selectCustomer',
      productInfo: {
        price: productPrice,
        currency: productCurrency,
        unit: productUnit,
      },
      onFormSubmit: async (data: CustomPriceFormValues) => {
        // In selectCustomer mode, data.productId contains customerId
        const result = await createCustomPrice(data, { productId });
        if (result.success) {
          toast.success('Custom price created successfully');
        } else {
          toast.error(result.error || 'Failed to create custom price');
          throw new Error(result.error);
        }
      },
      onLoadProducts: async () => {
        const result = await getCustomers();
        if (!result.success || !result.data) {
          toast.error(result.error || 'Failed to load customers');
          return [];
        }
        return result.data;
      },
    });
  }, [customPriceModal, productId, productPrice, productCurrency, productUnit]);

  return handleAddCustomPrice;
}
