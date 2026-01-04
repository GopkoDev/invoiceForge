import { notFound } from 'next/navigation';
import { getSenderProfile } from '@/lib/actions/sender-profile-actions';
import { getBankAccounts } from '@/lib/actions/bank-account-actions';
import { SenderProfileDetailView } from '@/components/sender-profiles/sender-profile-detail-view';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sender Profile Details',
  description: 'View sender profile information and activity',
};

interface SenderProfileDetailPageProps {
  params: Promise<{ id: string }>;
}

const PREVIEW_BANK_ACCOUNTS_LIMIT = 5;

export default async function SenderProfileDetailPage({
  params,
}: SenderProfileDetailPageProps) {
  const { id } = await params;
  const [profileResult, bankAccountsResult] = await Promise.all([
    getSenderProfile(id),
    getBankAccounts(id, PREVIEW_BANK_ACCOUNTS_LIMIT),
  ]);

  if (!profileResult.success || !profileResult.data) {
    notFound();
  }

  const profile = profileResult.data;
  const bankAccounts = bankAccountsResult.success
    ? bankAccountsResult.data || []
    : [];

  return (
    <SenderProfileDetailView profile={profile} bankAccounts={bankAccounts} />
  );
}
