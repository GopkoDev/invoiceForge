import { protectedRoutes } from '@/config/routes.config';
import { ContentAreaNotFound } from '@/components/layout/content-area';

export default function ProductEditNotFound() {
  return (
    <ContentAreaNotFound
      title="Products Not Found"
      description="The products you're looking for don't exist or you don't have access to them."
      backHref={protectedRoutes.products}
      backText="Back to Products"
    />
  );
}
