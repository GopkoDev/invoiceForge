import { protectedRoutes } from '@/config/routes.config';
import { ContentAreaNotFound } from '@/components/layout/content-area';

export default function CustomerNotFound() {
  return (
    <ContentAreaNotFound
      title="Customer Not Found"
      description="The customer you're looking for doesn't exist or has been deleted."
      backHref={protectedRoutes.customers}
      backText="Back to Customers"
    />
  );
}
