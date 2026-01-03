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

  const profile = result.data;

  const defaultValues = {
    id: profile.id,
    name: profile.name,
    legalName: profile.legalName || '',
    taxId: profile.taxId || '',
    address: profile.address || '',
    city: profile.city || '',
    country: profile.country || '',
    postalCode: profile.postalCode || '',
    phone: profile.phone || '',
    email: profile.email || '',
    website: profile.website || '',
    logo: profile.logo || '',
    invoicePrefix: profile.invoicePrefix,
    isDefault: profile.isDefault,
  };

  return <SenderProfileForm defaultValues={defaultValues} isEditing />;
}
