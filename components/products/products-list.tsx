import { Package } from 'lucide-react';
import { protectedRoutes } from '@/config/routes.config';
import { EmptyState } from '@/components/layout/content-area/empty-state';
import { SerializedProduct } from '@/types/product/types';
import { ProductsTable } from './products-table';

interface ProductsListProps {
  products: SerializedProduct[];
}

export function ProductsList({ products }: ProductsListProps) {
  return products.length === 0 ? (
    <EmptyState
      title="No Products"
      description="Create your first product or service to start adding items to your invoices. Manage your catalog in one place."
      href={protectedRoutes.productsNew}
      linkText="Add Product"
      Icon={Package}
    />
  ) : (
    <ProductsTable products={products} />
  );
}
