'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { useModal } from '@/store/use-modal-store';
import { createCustomPrice } from '@/lib/actions/custom-price-actions';
import { getCustomers } from '@/lib/actions/customer-actions';
import type { CustomPriceSchemaValues } from '@/lib/validations/custom-price';
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
      fixedProductId: productId,
      productInfo: {
        price: productPrice,
        currency: productCurrency,
        unit: productUnit,
      },
      onFormSubmit: (data: CustomPriceSchemaValues) => createCustomPrice(data),
      onLoadProducts: async () => {
        const result = await getCustomers();
        if (!result.success) {
          toast.error(result.error || 'Failed to load customers');
          return [];
        }
        return result.data;
      },
    });
  }, [customPriceModal, productId, productPrice, productCurrency, productUnit]);

  return handleAddCustomPrice;
}
