// T21 (ai-assistant; spec.md §5 AC-32; ADR-0012): the MCP repeat marks. A mark is honoured for 24 hours;
// it is written in the same transaction as the invoice it points to.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/prisma';

export const REPEAT_WINDOW_MS = 24 * 3_600_000;

/** `proposal` is the first answer's DraftProposal as JSON; null on rows written before the column existed. */
export type RepeatMark = {
  fingerprint: string;
  invoiceId: string | null;
  proposal: Prisma.JsonValue | null;
};

/** The live mark for the key and repeat key, or null (none, or older than 24 h). */
export async function readRepeatMark(
  keyId: string,
  repeatKey: string,
  now: Date
): Promise<RepeatMark | null> {
  const mark = await prisma.mcpDraftRepeat.findUnique({
    where: { personalKeyId_repeatKey: { personalKeyId: keyId, repeatKey } },
    select: { fingerprint: true, invoiceId: true, proposal: true, createdAt: true },
  });
  if (!mark || now.getTime() - mark.createdAt.getTime() >= REPEAT_WINDOW_MS) return null;
  return { fingerprint: mark.fingerprint, invoiceId: mark.invoiceId, proposal: mark.proposal };
}

/** Writes the mark in the caller's transaction, replacing a stale one (older than 24 h, not yet purged). */
export async function writeRepeatMark(
  tx: Prisma.TransactionClient,
  mark: {
    keyId: string;
    repeatKey: string;
    fingerprint: string;
    invoiceId: string;
    proposal: Prisma.InputJsonValue;
  },
  now: Date
): Promise<void> {
  await tx.mcpDraftRepeat.deleteMany({
    where: {
      personalKeyId: mark.keyId,
      repeatKey: mark.repeatKey,
      createdAt: { lte: new Date(now.getTime() - REPEAT_WINDOW_MS) },
    },
  });
  await tx.mcpDraftRepeat.create({
    data: {
      personalKeyId: mark.keyId,
      repeatKey: mark.repeatKey,
      fingerprint: mark.fingerprint,
      invoiceId: mark.invoiceId,
      proposal: mark.proposal,
    },
  });
}
