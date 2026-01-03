import { ContentArea } from '@/components/layout/content-area/content-area';
import { SenderProfileModalContainer } from '@/components/modals/sender-profile/sender-profile-modal-container';

export default function SenderProfilesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ContentArea>{children}</ContentArea>

      <SenderProfileModalContainer />
    </>
  );
}
