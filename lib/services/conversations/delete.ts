// T25 (ai-assistant; spec.md §5 AC-37; sad.md §6 Flow 8): owner-scoped deletes. Messages and Draft cards cascade,
// turn metadata detaches, invoices are untouched.
import 'server-only';
import { prisma } from '@/prisma';
import { ok, fail, type ActionResult } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { failed } from '@/lib/services/_shared/result-helpers';

const FAILED_MESSAGE = "We couldn't delete your conversations. Please try again.";

export async function deleteConversation(actor: ActingFreelancer, id: string): Promise<ActionResult<void>> {
  try {
    const { count } = await prisma.conversation.deleteMany({ where: { id, userId: actor.userId } });
    if (count === 0) return fail('NOT_FOUND', "This conversation can't be found.");
    return ok(undefined);
  } catch (error) {
    return failed('deleteConversation failed', error, FAILED_MESSAGE);
  }
}

export async function deleteAllConversations(actor: ActingFreelancer): Promise<ActionResult<{ deleted: number }>> {
  try {
    const { count } = await prisma.conversation.deleteMany({ where: { userId: actor.userId } });
    return ok({ deleted: count });
  } catch (error) {
    return failed('deleteAllConversations failed', error, FAILED_MESSAGE);
  }
}
