import { Package, Users } from 'lucide-react';
import Link from 'next/link';
import { protectedRoutes } from '@/config/routes.config';
import { getUnitLabel } from '@/lib/helpers';

interface ProductInfoProps {
  productId: string;
  name: string;
  unit: string;
  isActive?: boolean;
}

export function ProductInfo({
  productId,
  name,
  unit,
  isActive = true,
}: ProductInfoProps) {
  return (
    <Link
      href={protectedRoutes.productCustomPrices(productId)}
      className="flex items-center gap-2 hover:underline transition-colors"
    >
      <div className="flex items-center justify-center h-8 w-8 rounded bg-primary/10 shrink-0">
        <Package className="h-4 w-4 text-primary" />
      </div>
      <div className="flex flex-col">
        <span>{name}</span>
        <span className="text-xs text-muted-foreground">
          per {getUnitLabel(unit)}
          {!isActive && ' • Inactive'}
        </span>
      </div>
    </Link>
  );
}

interface CustomerInfoProps {
  id: string;
  name: string;
  companyName?: string | null;
}

export function CustomerInfo({ id, name, companyName }: CustomerInfoProps) {
  return (
    <Link
      href={protectedRoutes.customerDetail(id)}
      className="flex items-center gap-2 hover:underline transition-colors"
    >
      <div className="flex items-center justify-center h-8 w-8 rounded bg-primary/10 shrink-0">
        <Users className="h-4 w-4 text-primary" />
      </div>
      <div className="flex flex-col">
        <span>{companyName || name}</span>
        {companyName && (
          <span className="text-xs text-muted-foreground">{name}</span>
        )}
      </div>
    </Link>
  );
}
