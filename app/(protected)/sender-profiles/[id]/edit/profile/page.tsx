import { SenderProfileForm } from '@/components/sender-profiles/sender-profile-form';
import { getSenderProfile } from '@/lib/actions/sender-profile-actions';
import { unwrapPageResult } from '@/components/layout/content-area';

interface EditSenderProfileProfilePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSenderProfileProfilePage({
  params,
}: EditSenderProfileProfilePageProps) {
  const { id } = await params;
  const result = await getSenderProfile(id);
  const defaultValues = unwrapPageResult(result);

  return <SenderProfileForm defaultValues={defaultValues} isEditing />;
}
