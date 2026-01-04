import { protectedRoutes } from '@/config/routes.config';
import { ContentAreaNotFound } from '@/components/layout/content-area';

export default function ProductEditNotFound() {
  return (
    <ContentAreaNotFound
      title="Product Not Found"
      description="The product you're trying to edit doesn't exist or has been deleted."
      backHref={protectedRoutes.products}
      backText="Back to Products"
    />
  );
}
