'use client';

import { StartPanel } from '@/components/ai/start-panel';
import type { AllowanceState } from '@/lib/validations/assistant-chat';

// A function prop cannot cross the server-to-client boundary, so the page renders this wrapper,
// which owns onSend. T33's chat island replaces the no-op.
export function StartPanelClient(props: { state: AllowanceState; start?: 'draft' }) {
  return <StartPanel {...props} onSend={() => {}} />;
}
