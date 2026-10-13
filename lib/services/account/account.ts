import 'server-only';
import { captureException } from '@sentry/nextjs';
import type {
  ChoiceOfferKind,
  ChoiceOfferState,
  MessageOrigin,
} from '@prisma/client';
import { prisma } from '@/prisma';
import { redactError } from '@/lib/helpers/prisma-error-scrub';
import { fail, ok, type ActionResult } from '@/types/result';
import {
  createLimitStore,
  type Clock,
} from '@/lib/security/limits/limit-store';
import { scopeConfig } from '@/lib/security/limits/scopes';
import { addressLimitKey } from '@/lib/security/limits/keys';
import type { ActingFreelancer } from '@/lib/services/_shared/acting-freelancer';

const ACCOUNT_NOT_FOUND = 'Account not found.';

/**
 * Counts the invoices that will be permanently lost if the account is deleted
 * (spec.md §5, AC-20), across every sender profile the Freelancer owns.
 */
export async function getAccountDeletionSummary(
  actor: ActingFreelancer
): Promise<ActionResult<{ invoiceCount: number }>> {
  try {
    const invoiceCount = await prisma.invoice.count({
      where: { senderProfile: { userId: actor.userId } },
    });
    return ok({ invoiceCount });
  } catch (error) {
    console.error(
      'Error counting invoices for account deletion:',
      redactError(error)
    );
    captureException(error);
    return fail('FAILED', 'Something went wrong. Please try again.');
  }
}

/**
 * Deletes the account and every row it owns in one explicit transaction (adr/0007).
 * Invoices (and their items, by cascade) go first so the Restrict FKs never trip when
 * User cascades; VerificationToken rows for the account's email go too. Any failure
 * rolls back everything (AC-20). Only a session-verified wrapper may call this (spec §6.1).
 */
export async function deleteAccount(
  actor: ActingFreelancer
): Promise<ActionResult<void>> {
  const { userId } = actor;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) return fail('NOT_FOUND', ACCOUNT_NOT_FOUND);

    await prisma.$transaction([
      prisma.limitEvent.deleteMany({
        where: { scope: 'SIGNIN_ADDRESS', key: addressLimitKey(user.email) },
      }),
      prisma.invoice.deleteMany({ where: { senderProfile: { userId } } }),
      prisma.verificationToken.deleteMany({
        where: { identifier: user.email },
      }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    return ok();
  } catch (error) {
    console.error('Error deleting user account:', redactError(error));
    captureException(error);
    return fail(
      'FAILED',
      "Your account couldn't be deleted. Nothing was removed."
    );
  }
}

async function readExport(userId: string) {
  const [
    user,
    accounts,
    emailHistory,
    senderProfiles,
    customers,
    products,
    invoices,
    personalKeys,
    conversationRows,
    allowanceRows,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        timeZone: true,
        overdueNoticeDismissedAt: true,
      },
    }),
    prisma.account.findMany({
      where: { userId },
      select: { provider: true, type: true, createdAt: true },
    }),
    prisma.emailHistory.findMany({ where: { userId } }),
    prisma.senderProfile.findMany({
      where: { userId },
      include: { bankAccounts: true },
    }),
    prisma.customer.findMany({
      where: { userId },
      include: {
        customPrices: {
          include: { product: { select: { name: true, unit: true } } },
        },
      },
    }),
    prisma.product.findMany({
      where: { userId },
      include: {
        customPrices: {
          include: { customer: { select: { name: true } } },
        },
      },
    }),
    prisma.invoice.findMany({
      where: { senderProfile: { userId } },
      include: { items: true },
      // A Personal key's id never leaves the database (mcp-server AC-25).
      omit: { assistantKeyId: true },
    }),
    // Explicit select: digest, lastFour, activeNameKey and id never leave the database (AC-25).
    prisma.personalKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        name: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
        canCreateDrafts: true,
        draftDays: {
          orderBy: { day: 'asc' },
          select: {
            day: true,
            created: true,
            allowance: true,
            lastLiftedAt: true,
          },
        },
        usageWeeks: {
          orderBy: { weekStart: 'asc' },
          select: {
            weekStart: true,
            attempts: true,
            successes: true,
            assistantErrors: true,
          },
        },
      },
    }),
    prisma.conversation.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        title: true,
        createdAt: true,
        lastMessageAt: true,
        startedFrom: true,
        messages: {
          orderBy: { position: 'asc' },
          select: {
            role: true,
            createdAt: true,
            parts: true,
            origin: true,
            // Labels and the chosen option only: never the stored request or option refs (ai-chat-v2 AC-34).
            offer: {
              select: {
                kind: true,
                options: true,
                state: true,
                chosenOptionId: true,
                createdAt: true,
              },
            },
          },
        },
        draftCards: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            state: true,
            createdAt: true,
            proposal: true,
            invoiceId: true,
          },
        },
      },
    }),
    prisma.messageAllowanceDay.findMany({
      where: { userId },
      orderBy: { day: 'asc' },
      select: { day: true, used: true },
    }),
  ]);
  const conversations = conversationRows.map((c) => ({
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    lastMessageAt: c.lastMessageAt.toISOString(),
    startedFrom: c.startedFrom,
    messages: c.messages.map((m) => exportMessage(m)),
    draftCards: c.draftCards.map((card) => ({
      ...card,
      createdAt: card.createdAt.toISOString(),
    })),
  }));
  const messageAllowanceDays = allowanceRows.map((r) => ({
    day: dayString(r.day),
    used: r.used,
  }));
  return {
    user,
    accounts,
    emailHistory,
    senderProfiles,
    customers,
    products,
    invoices,
    personalKeys: personalKeys.map((k) => ({
      ...k,
      draftDays: k.draftDays.map((d) => ({
        ...d,
        day: dayString(d.day),
        lastLiftedAt: d.lastLiftedAt?.toISOString() ?? null,
      })),
    })),
    conversations,
    messageAllowanceDays,
  };
}

/** A stored local calendar day (00:00 UTC) as yyyy-MM-dd. */
function dayString(day: Date): string {
  return day.toISOString().slice(0, 10);
}

type StoredPart = { type?: unknown; text?: unknown; data?: unknown };

type StoredOfferOption = { optionId?: unknown; label?: unknown };

/** An Offered choice as exported: its labels and the chosen option, never its record refs (ai-chat-v2 AC-34). */
function exportOffer(
  offer: {
    kind: ChoiceOfferKind;
    options: unknown;
    state: ChoiceOfferState;
    chosenOptionId: number | null;
    createdAt: Date;
  } | null
) {
  if (!offer) return null;
  const options = (
    Array.isArray(offer.options) ? offer.options : []
  ) as StoredOfferOption[];
  return {
    kind: offer.kind,
    options: options.map((o) => ({
      optionId: Number(o.optionId),
      label: String(o.label),
    })),
    state: offer.state,
    chosenOptionId: offer.chosenOptionId,
    createdAt: offer.createdAt.toISOString(),
  };
}

/** Flattens stored UI-message parts into text, links and Draft card ids (ADR-0008), plus origin and offer. */
function exportMessage(m: {
  role: 'USER' | 'ASSISTANT';
  createdAt: Date;
  parts: unknown;
  origin: MessageOrigin | null;
  offer: Parameters<typeof exportOffer>[0];
}) {
  const parts = (Array.isArray(m.parts) ? m.parts : []) as StoredPart[];
  const links: unknown[] = [];
  const draftCardIds: string[] = [];
  let text = '';
  for (const part of parts) {
    if (part.type === 'text' && typeof part.text === 'string') {
      text += part.text;
    } else if (part.type === 'data-link') {
      links.push(part.data);
    } else if (part.type === 'data-draft-card') {
      const cardId = (part.data as { cardId?: unknown } | undefined)?.cardId;
      if (typeof cardId === 'string') draftCardIds.push(cardId);
    }
  }
  return {
    role: m.role === 'USER' ? ('user' as const) : ('assistant' as const),
    createdAt: m.createdAt.toISOString(),
    text,
    links,
    draftCardIds,
    // A USER row with no origin reads TYPED, as in the reopen view (data-model.md ConversationMessage.origin).
    origin: m.role === 'USER' ? (m.origin ?? 'TYPED') : null,
    offer: exportOffer(m.offer),
  };
}

type ExportRead = Awaited<ReturnType<typeof readExport>>;

export type AccountExport = Omit<ExportRead, 'user'> & {
  exportDate: string;
  exportVersion: '2.3';
  user: NonNullable<ExportRead['user']>;
};

const EXPORT_FAILED = "Your data couldn't be exported. Try again.";
const EXPORT_RATE_LIMITED =
  "You've reached the export limit. You can export again later.";

/**
 * Every category the account owns, scoped by actor.userId (exportVersion 2.3: Personal keys with weekly usage and draft counts, time zone, Conversations with start points, message origins and Offered choices, daily message counts).
 * A place is reserved in the limit store before any read (ADR-0005); a system-side failure
 * releases it, a limit-store failure refuses the export (never unlimited). An account that is
 * gone is NOT_FOUND: nothing is recorded, and a place
 * reserved before the account vanished mid-read is released.
 */
export async function getAccountExport(
  actor: ActingFreelancer,
  overrides: { clock?: Clock } = {}
): Promise<ActionResult<AccountExport>> {
  const { userId } = actor;
  const store = createLimitStore({ clock: overrides.clock });
  let reservedId: string;
  try {
    const exists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) return fail('NOT_FOUND', ACCOUNT_NOT_FOUND);

    const reservation = await store.withKeyLock(
      'EXPORT',
      userId,
      async (limit): Promise<{ retryAt: Date } | { id: string }> => {
        if ((await limit.countInWindow()) >= scopeConfig('EXPORT').max) {
          const retryAt = await limit.retryAt();
          if (retryAt) return { retryAt };
        }
        return { id: (await limit.record('STARTED', { userId })).id };
      }
    );
    if ('retryAt' in reservation) {
      return fail('RATE_LIMITED', EXPORT_RATE_LIMITED, {
        details: {
          kind: 'RETRY_AT',
          retryAt: reservation.retryAt.toISOString(),
        },
      });
    }
    reservedId = reservation.id;
  } catch (error) {
    console.error('Error reserving a data export:', redactError(error));
    captureException(error);
    return fail('FAILED', EXPORT_FAILED);
  }

  const releasePlace = async () => {
    try {
      await store.withKeyLock('EXPORT', userId, (limit) =>
        limit.markFailed(reservedId)
      );
    } catch (releaseError) {
      console.error(
        'Error releasing an export place:',
        redactError(releaseError)
      );
      captureException(releaseError);
    }
  };

  try {
    const { user, ...rest } = await readExport(userId);
    if (!user) {
      await releasePlace();
      return fail('NOT_FOUND', ACCOUNT_NOT_FOUND);
    }

    return ok({
      exportDate: new Date().toISOString(),
      exportVersion: '2.3',
      user,
      ...rest,
    });
  } catch (error) {
    console.error('Error exporting user data:', redactError(error));
    captureException(error);
    await releasePlace();
    return fail('FAILED', EXPORT_FAILED);
  }
}
