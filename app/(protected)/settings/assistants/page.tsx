import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { AssistantKeys } from '@/components/assistants/assistant-keys';
import { unwrapPageResult } from '@/components/layout/content-area';
import { actingFreelancerFromSession } from '@/lib/helpers/session-actor';
import { listPersonalKeys } from '@/lib/services/personal-keys/personal-keys';

export const metadata: Metadata = {
  title: 'Connect your AI',
};

export default async function AssistantsPage() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto =
    h.get('x-forwarded-proto') ??
    (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;

  const actor = unwrapPageResult(await actingFreelancerFromSession());
  const keys = unwrapPageResult(await listPersonalKeys(actor));

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Connect your AI</h1>
        <p className="text-muted-foreground text-sm">
          Let Claude or Cursor read your invoices and answer money questions.
          Keys are read-only: an assistant can&apos;t change or send anything.
        </p>
      </div>
      <AssistantKeys origin={origin} timeZone={actor.timeZone} keys={keys} />
    </div>
  );
}
