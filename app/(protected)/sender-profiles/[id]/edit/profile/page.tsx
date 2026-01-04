import { SenderProfileForm } from '@/components/sender-profiles/sender-profile-form';
import { getSenderProfile } from '@/lib/actions/sender-profile-actions';
import { notFound } from 'next/navigation';

interface EditSenderProfileProfilePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSenderProfileProfilePage({
  params,
}: EditSenderProfileProfilePageProps) {
  const { id } = await params;
  const result = await getSenderProfile(id);

  if (!result.success || !result.data) {
    notFound();
  }

  const defaultValues = result.data;

  return <SenderProfileForm defaultValues={defaultValues} isEditing />;
}
