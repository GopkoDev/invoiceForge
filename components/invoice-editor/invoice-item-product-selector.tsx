'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronsUpDown, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Currency } from '@/types/invoice/types';
import { GroupedProducts, ProductOption } from '@/store/invoice-editor-store';

interface InvoiceItemProductSelectorProps {
  productName: string;
  productId: string;
  currency: Currency;
  groupedProducts: GroupedProducts;
  isCustomItem: boolean;
  onProductSelect: (product: ProductOption, closePopover: () => void) => void;
  onProductNameChange: (value: string) => void;
}

export function InvoiceItemProductSelector({
  productName,
  productId,
  currency,
  groupedProducts,
  isCustomItem,
  onProductSelect,
  onProductNameChange,
}: InvoiceItemProductSelectorProps) {
  const [productOpen, setProductOpen] = useState(false);

  const hasCustomPriceProducts = groupedProducts.withCustomPrices.length > 0;
  const hasRegularProducts = groupedProducts.regular.length > 0;

  if (isCustomItem) {
    return (
      <Input
        type="text"
        value={productName}
        onChange={(e) => onProductNameChange(e.target.value)}
        placeholder="Enter product name..."
        className="w-full"
      />
    );
  }

  return (
    <Popover open={productOpen} onOpenChange={setProductOpen}>
      <PopoverTrigger className="border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 mb-0 inline-flex h-9 w-full items-center justify-between gap-1.5 rounded-md border px-2.5 text-left text-sm font-normal shadow-xs">
        <span className="truncate">{productName || 'Select product...'}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>

      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search products..." />

          <CommandList>
            <CommandEmpty>No products found.</CommandEmpty>

            {hasCustomPriceProducts && (
              <CommandGroup heading="Custom Prices">
                {groupedProducts.withCustomPrices.map((product) => (
                  <CommandItem
                    key={product.id}
                    value={product.name}
                    onSelect={() =>
                      onProductSelect(product, () => setProductOpen(false))
                    }
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        productId === product.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-center gap-1.5">
                        <Star className="text-primary h-3 w-3 fill-current" />
                        <span>{product.name}</span>
                      </div>
                      <span className="text-primary text-xs">
                        {product.customPrice} {currency} / {product.unit}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {hasCustomPriceProducts && hasRegularProducts && (
              <CommandSeparator />
            )}

            {hasRegularProducts && (
              <CommandGroup
                heading={hasCustomPriceProducts ? 'All Products' : undefined}
              >
                {groupedProducts.regular.map((product) => (
                  <CommandItem
                    key={product.id}
                    value={product.name}
                    onSelect={() =>
                      onProductSelect(product, () => setProductOpen(false))
                    }
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        productId === product.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex flex-1 flex-col">
                      <span>{product.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {product.price} {currency} / {product.unit}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
