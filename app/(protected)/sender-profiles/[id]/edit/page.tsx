import { redirect } from 'next/navigation';
import { protectedRoutes } from '@/config/routes.config';

interface EditSenderProfilePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSenderProfilePage({
  params,
}: EditSenderProfilePageProps) {
  const { id } = await params;
  redirect(protectedRoutes.senderProfileEditTab(id));
}
