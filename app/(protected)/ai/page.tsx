import { ChatIsland } from '@/components/ai/chat-island';
import { startPointFromAddress } from '@/components/ai/start-point';
import { unwrapPageResult } from '@/components/layout/content-area';
import { sessionAccountName } from '@/lib/helpers/account-name';
import { greetingLine } from '@/lib/helpers/greeting';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import { getAllowanceState } from '@/lib/services/assistant-usage';

interface AiPageProps {
  searchParams: Promise<{
    start?: string | string[];
    from?: string | string[];
  }>;
}

export default async function AiPage({ searchParams }: AiPageProps) {
  // ai-chat-v2 T20: the start point the first message is sent with comes from the address.
  const params = await searchParams;
  const { start, startedFrom } = startPointFromAddress(params);

  const actor = unwrapPageResult(await actingFreelancerFromSession());
  const allowance = unwrapPageResult(await getAllowanceState(actor));
  // ai-chat-v2 T37 (SCR-02 «Greeting»): computed here, in the Freelancer time zone, so the client renders the same text.
  const greeting = greetingLine(
    await sessionAccountName(),
    actor.timeZone,
    new Date()
  );

  return (
    <ChatIsland
      conversationId={null}
      initialMessages={[]}
      invoiceLinks={{}}
      cards={{}}
      allowance={allowance}
      start={start}
      startedFrom={startedFrom}
      greeting={greeting}
    />
  );
}
