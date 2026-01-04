import { ContactCardActions } from '@/components/layout/contacts';
import { deleteCustomer } from '@/lib/actions/customer-actions';
import { protectedRoutes } from '@/config/routes.config';

interface CustomerCardActionsProps {
  customerId: string;
  customerName: string;
}

export function CustomerCardActions({
  customerId,
  customerName,
}: CustomerCardActionsProps) {
  return (
    <ContactCardActions
      id={customerId}
      name={customerName}
      detailRoute={protectedRoutes.customerDetail(customerId)}
      deleteAction={deleteCustomer}
      entityLabel="Customer"
    />
  );
}
