import { AiModalContainer } from '@/components/modals/ai/ai-modal-container';

// ai-chat-v2 T19 (sad.md §5 "Full-height workspace"; AC-15): the AI section fills the viewport below the app header
// instead of the scrolling ContentArea; its panes scroll on their own and the page never does. The inset sidebar
// variant adds a 0.5rem margin above and below the content from md.
export default function AiLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="h-[calc(100dvh-var(--header-height))] overflow-hidden md:h-[calc(100dvh-var(--header-height)-1rem)]">
        {children}
      </div>

      <AiModalContainer />
    </>
  );
}
