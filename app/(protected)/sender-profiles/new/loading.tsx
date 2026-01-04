import { ContentAreaHeader } from '@/components/layout/content-area';
import { SenderProfileFormLoading } from '@/components/sender-profiles/sender-profile-form-loading';

export default function NewSenderProfileLoading() {
  return (
    <>
      <ContentAreaHeader
        title="New Sender Profile"
        description="Create a new company or business profile"
      />
      <SenderProfileFormLoading />
    </>
  );
}
