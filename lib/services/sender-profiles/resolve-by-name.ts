import 'server-only';
import { prisma } from '@/prisma';
import { ok, type ActionResult, type AmbiguousCandidate } from '@/types/result';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';
import { escapeLike } from '@/lib/services/_shared/list-query';
import { failed } from '@/lib/services/_shared/result-helpers';

// T16 (AC-08, AC-20/21 pattern): a sender profile named by part of its name, ignoring case, among
// the acting Freelancer's profiles only. Another Freelancer's profile is simply never in the scan.

const MAX_CANDIDATES = 50;

export type NameMatch<T> =
  | { kind: 'none' }
  | ({ kind: 'one' } & T)
  | { kind: 'candidates'; candidates: AmbiguousCandidate[] };

export type SenderProfileMatch = NameMatch<{ senderProfileId: string; name: string }>;

export async function resolveSenderProfileByName(
  actor: ActingFreelancer,
  name: string,
): Promise<ActionResult<SenderProfileMatch>> {
  const text = name.trim();
  if (text === '') return ok({ kind: 'none' });
  try {
    const rows = await prisma.senderProfile.findMany({
      where: { userId: actor.userId, name: { contains: escapeLike(text), mode: 'insensitive' } },
      select: { id: true, name: true, legalName: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: MAX_CANDIDATES,
    });
    if (rows.length === 0) return ok({ kind: 'none' });
    if (rows.length === 1) return ok({ kind: 'one', senderProfileId: rows[0].id, name: rows[0].name });
    return ok({
      kind: 'candidates',
      candidates: rows.map((r) => ({ id: r.id, name: r.name, ...(r.legalName ? { detail: r.legalName } : {}) })),
    });
  } catch (error) {
    return failed('Error resolving sender profile by name:', error, 'Failed to fetch sender profiles.');
  }
}
