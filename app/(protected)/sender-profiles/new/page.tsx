import { ContentAreaHeader } from '@/components/layout/content-area';
import { SenderProfileForm } from '@/components/sender-profiles/sender-profile-form';
import { getSenderProfiles } from '@/lib/actions/sender-profile-actions';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New Sender Profile',
  description: 'Create a new company or business profile',
};

export default async function NewSenderProfilePage() {
  // invoice-integrity T19 (SCR-09, AC-17b): the Freelancer's first profile is the default.
  const profiles = await getSenderProfiles();
  const isFirst = profiles.success && profiles.data.length === 0;

  return (
    <>
      <ContentAreaHeader
        title="New Sender Profile"
        description="Create a new company or business profile"
      />

      <SenderProfileForm isFirst={isFirst} />
    </>
  );
}
