import { ContentAreaHeader } from '@/components/layout/content-area/content-area';
import { SenderProfileForm } from '@/components/sender-profiles/sender-profile-form';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New Sender Profile',
  description: 'Create a new company or business profile',
};

export default function NewSenderProfilePage() {
  return (
    <>
      <ContentAreaHeader
        title="New Sender Profile"
        description="Create a new company or business profile"
      />

      <SenderProfileForm />
    </>
  );
}
