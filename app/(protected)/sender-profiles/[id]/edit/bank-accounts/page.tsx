import { notFound } from 'next/navigation';
import { getBankAccounts } from '@/lib/actions/bank-account-actions';
import { BankAccountsList } from '@/components/bank-accounts/bank-accounts-list';

interface EditSenderProfileBankAccountsPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSenderProfileBankAccountsPage({
  params,
}: EditSenderProfileBankAccountsPageProps) {
  const { id } = await params;

  const result = await getBankAccounts(id);

  if (!result.success) {
    console.error('Error fetching bank accounts:', result.error);
    notFound();
  }

  const bankAccounts = result.data;

  return <BankAccountsList senderProfileId={id} bankAccounts={bankAccounts} />;
}
