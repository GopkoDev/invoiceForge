'use client';

// T35 (spec.md §5 AC-22; screens.md SCR-19 "delete" → SCR-14; review-2026-09-27.md F-16) — the
// sender profile detail page has no delete entry point. Deleting from here goes to the Sender
// profiles list (SCR-14 "deleted" from a detail page), rather than refreshing in place like the
// list row does.
import { useRouter } from 'next/navigation';
import { ContactCardActions } from '@/components/layout/contacts';
import { deleteSenderProfile } from '@/lib/actions/sender-profile-actions';
import { protectedRoutes } from '@/config/routes.config';

interface SenderProfileDetailDeleteActionProps {
  profileId: string;
  profileName: string;
}

export function SenderProfileDetailDeleteAction({
  profileId,
  profileName,
}: SenderProfileDetailDeleteActionProps) {
  const router = useRouter();

  return (
    <ContactCardActions
      id={profileId}
      name={profileName}
      detailRoute={protectedRoutes.senderProfileDetail(profileId)}
      deleteAction={deleteSenderProfile}
      entityLabel="Sender Profile"
      showPreview={false}
      onDeleted={() => router.push(protectedRoutes.senderProfiles)}
    />
  );
}
