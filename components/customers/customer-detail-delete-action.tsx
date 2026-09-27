'use client';

// T35 (spec.md §5 AC-22; screens.md SCR-09 "delete" → SCR-14; review-2026-09-27.md F-16) — the
// Customer detail page has no delete entry point. Deleting from here goes to the Customers list
// (SCR-14 "deleted" from a detail page), rather than refreshing in place like the list row does.
import { useRouter } from 'next/navigation';
import { ContactCardActions } from '@/components/layout/contacts';
import { deleteCustomer } from '@/lib/actions/customer-actions';
import { protectedRoutes } from '@/config/routes.config';

interface CustomerDetailDeleteActionProps {
  customerId: string;
  customerName: string;
}

export function CustomerDetailDeleteAction({
  customerId,
  customerName,
}: CustomerDetailDeleteActionProps) {
  const router = useRouter();

  return (
    <ContactCardActions
      id={customerId}
      name={customerName}
      detailRoute={protectedRoutes.customerDetail(customerId)}
      deleteAction={deleteCustomer}
      entityLabel="Customer"
      showPreview={false}
      onDeleted={() => router.push(protectedRoutes.customers)}
    />
  );
}
