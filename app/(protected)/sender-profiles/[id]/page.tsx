import { getSenderProfile } from '@/lib/actions/sender-profile-actions';
import { getBankAccounts } from '@/lib/actions/bank-account-actions';
import { getInvoicesBySenderProfile } from '@/lib/actions/invoice-actions/invoice-actions';
import { SenderProfileDetailView } from '@/components/sender-profiles/sender-profile-detail-view';
import { unwrapPageResult } from '@/components/layout/content-area';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sender Profile Details',
  description: 'View sender profile information and activity',
};

interface SenderProfileDetailPageProps {
  params: Promise<{ id: string }>;
}

const PREVIEW_BANK_ACCOUNTS_LIMIT = 5;
const PREVIEW_INVOICES_LIMIT = 5;

export default async function SenderProfileDetailPage({
  params,
}: SenderProfileDetailPageProps) {
  const { id } = await params;
  const [profileResult, bankAccountsResult, invoicesResult] = await Promise.all(
    [
      getSenderProfile(id),
      getBankAccounts(id, PREVIEW_BANK_ACCOUNTS_LIMIT),
      getInvoicesBySenderProfile(id, PREVIEW_INVOICES_LIMIT),
    ]
  );

  // The record first, so a missing or foreign profile is not-found, not a load error.
  const profile = unwrapPageResult(profileResult);
  const bankAccounts = unwrapPageResult(bankAccountsResult) ?? [];
  const invoices = unwrapPageResult(invoicesResult) ?? [];

  return (
    <SenderProfileDetailView
      profile={profile}
      bankAccounts={bankAccounts}
      invoices={invoices}
    />
  );
}
