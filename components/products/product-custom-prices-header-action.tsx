'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useProductCustomPriceModal } from '@/hooks/use-product-custom-price-modal';
import type { Currency } from '@prisma/client';

interface ProductCustomPricesHeaderActionProps {
  productId: string;
  productPrice: number;
  productCurrency: Currency;
  productUnit: string;
}

export function ProductCustomPricesHeaderAction({
  productId,
  productPrice,
  productCurrency,
  productUnit,
}: ProductCustomPricesHeaderActionProps) {
  const handleAddCustomPrice = useProductCustomPriceModal({
    productId,
    productPrice,
    productCurrency,
    productUnit,
  });

  return (
    <Button size="sm" onClick={handleAddCustomPrice}>
      <Plus className="h-4 w-4" />
      Add Custom Price
    </Button>
  );
}
