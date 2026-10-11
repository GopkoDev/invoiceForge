import 'server-only';
import type { Invoice } from '@prisma/client';
import type { AssistantMark } from '@/types/invoice/types';

/** AC-23 / ADR-0013: the Assistant mark of an invoice read, only while the stored status is DRAFT.
 * The key name is the one recorded at creation. */
export function assistantMarkOf(
  invoice: Pick<Invoice, 'status' | 'assistantOrigin' | 'assistantKeyName'>
): AssistantMark {
  if (invoice.status !== 'DRAFT') return null;
  if (invoice.assistantOrigin === 'CHAT') return { origin: 'CHAT' };
  if (invoice.assistantOrigin === 'PERSONAL_KEY') {
    return { origin: 'PERSONAL_KEY', keyName: invoice.assistantKeyName ?? '' };
  }
  return null;
}
