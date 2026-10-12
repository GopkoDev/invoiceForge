import { AiModalContainer } from '@/components/modals/ai/ai-modal-container';

export default function AiLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}

      <AiModalContainer />
    </>
  );
}
