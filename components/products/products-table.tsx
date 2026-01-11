'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Package,
  MoreHorizontal,
  Pencil,
  Trash2,
  Power,
  DollarSign,
} from 'lucide-react';
import { protectedRoutes } from '@/config/routes.config';
import { SerializedProduct } from '@/types/product/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency, getUnitLabel } from '@/lib/helpers';
import { useModal } from '@/store/use-modal-store';
import {
  deleteProduct,
  toggleProductActive,
} from '@/lib/actions/product-actions';

interface ProductsTableProps {
  products: SerializedProduct[];
}

export function ProductsTable({ products }: ProductsTableProps) {
  const router = useRouter();
  const confirmationModal = useModal('confirmationModal');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleDelete = (product: SerializedProduct) => {
    confirmationModal.open({
      open: true,
      title: 'Delete Product',
      description: `Are you sure you want to delete "${product.name}"? This action cannot be undone.`,
      variant: 'destructive',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setLoadingId(product.id);
        const result = await deleteProduct(product.id);

        if (result.success) {
          toast.success('Product deleted successfully');
          router.refresh();
        } else {
          toast.error(result.error || 'Failed to delete product');
        }
        setLoadingId(null);
      },
      onClose: confirmationModal.close,
    });
  };

  const handleToggleActive = async (product: SerializedProduct) => {
    setLoadingId(product.id);
    const result = await toggleProductActive(product.id);

    if (result.success) {
      toast.success(
        `Product ${product.isActive ? 'deactivated' : 'activated'} successfully`
      );
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to update product status');
    }
    setLoadingId(null);
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead className="w-[300px]">Product</TableHead>
            <TableHead className="w-[140px] text-right">Price</TableHead>
            <TableHead className="w-[160px] text-center">Unit</TableHead>
            <TableHead className="w-[100px] text-center">Status</TableHead>
            <TableHead className="w-[100px] text-center">Invoices</TableHead>
            <TableHead className="w-[130px] text-center">
              Custom Prices
            </TableHead>
            <TableHead className="w-[70px]" aria-label="Actions"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="bg-muted flex h-9 w-9 items-center justify-center rounded-md">
                    <Package className="text-muted-foreground h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{product.name}</div>
                    {product.description && (
                      <div className="text-muted-foreground max-w-[200px] truncate text-xs">
                        {product.description}
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>

              <TableCell className="text-right font-medium">
                {formatCurrency(product.price, product.currency)}
              </TableCell>

              <TableCell className="text-muted-foreground text-center">
                {getUnitLabel(product.unit)}
              </TableCell>

              <TableCell className="text-center">
                <Badge variant={product.isActive ? 'default' : 'secondary'}>
                  {product.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>

              <TableCell className="text-muted-foreground text-center">
                {product._count.invoiceItems > 0 ? (
                  <span>{product._count.invoiceItems}</span>
                ) : (
                  <span className="opacity-50" aria-label="No invoices">
                    —
                  </span>
                )}
              </TableCell>

              <TableCell className="text-muted-foreground text-center">
                {product._count.customPrices > 0 ? (
                  <span>{product._count.customPrices}</span>
                ) : (
                  <span className="opacity-50" aria-label="No custom prices">
                    —
                  </span>
                )}
              </TableCell>

              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                    disabled={loadingId === product.id}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Open menu</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-full">
                    <DropdownMenuItem
                      onClick={() =>
                        router.push(
                          protectedRoutes.productCustomPrices(product.id)
                        )
                      }
                    >
                      <DollarSign className="mr-2 h-4 w-4" />
                      Custom Prices
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      onClick={() =>
                        router.push(protectedRoutes.productEdit(product.id))
                      }
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => handleToggleActive(product)}
                    >
                      <Power className="mr-2 h-4 w-4" />
                      {product.isActive ? 'Deactivate' : 'Activate'}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      onClick={() => handleDelete(product)}
                      variant="destructive"
                      disabled={product._count.invoiceItems > 0}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
