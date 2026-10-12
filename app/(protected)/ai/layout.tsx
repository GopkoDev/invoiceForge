import { ContentArea } from '@/components/layout/content-area';
import { AiModalContainer } from '@/components/modals/ai/ai-modal-container';

export default function AiLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ContentArea>{children}</ContentArea>

      <AiModalContainer />
    </>
  );
}
