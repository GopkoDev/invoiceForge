import { ContactCardActions } from '@/components/layout/contacts';
import { deleteSenderProfile } from '@/lib/actions/sender-profile-actions';
import { protectedRoutes } from '@/config/routes.config';

interface SenderProfileCardActionsProps {
  profileId: string;
  profileName: string;
}

export function SenderProfileCardActions({
  profileId,
  profileName,
}: SenderProfileCardActionsProps) {
  return (
    <ContactCardActions
      id={profileId}
      name={profileName}
      detailRoute={protectedRoutes.senderProfileDetail(profileId)}
      deleteAction={deleteSenderProfile}
      entityLabel="Sender Profile"
    />
  );
}
