import { getBankAccounts } from '@/lib/actions/bank-account-actions';
import { BankAccountsList } from '@/components/bank-accounts/bank-accounts-list';
import { unwrapPageResult } from '@/components/layout/content-area';

interface EditSenderProfileBankAccountsPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSenderProfileBankAccountsPage({
  params,
}: EditSenderProfileBankAccountsPageProps) {
  const { id } = await params;

  const result = await getBankAccounts(id);
  const bankAccounts = unwrapPageResult(result);

  return <BankAccountsList senderProfileId={id} bankAccounts={bankAccounts} />;
}
