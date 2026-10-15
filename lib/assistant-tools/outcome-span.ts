import 'server-only';
import { startSpan } from '@sentry/nextjs';
import type { ActionResult } from '@/types/result';

/**
 * ai-chat-v2 (sad §7 Monitoring): runs one read question in its span (`assistant-tools.<name>`) and records only
 * the outcome - `ok`, `failed` or `refused:<code>`. Metadata only (ai-assistant ADR-0004): never a label, a name,
 * an argument or prompt text.
 */
export function inOutcomeSpan<T>(name: string, run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  return startSpan({ name, op: 'function' }, async (span) => {
    const result = await run();
    const outcome = result.success ? 'ok' : result.code === 'FAILED' ? 'failed' : `refused:${result.code.toLowerCase()}`;
    // Optional: test doubles of startSpan may call the callback without a span.
    span?.setAttribute('outcome', outcome);
    return result;
  });
}
