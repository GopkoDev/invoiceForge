// Prisma error messages embed the rendered call arguments (`email: "..."`), and `errorFormat`
// cannot remove them: 'minimal' still includes them. They are cut before an error leaves the
// process, whether to Sentry (sentry.server.config.ts) or to the application's own server log
// lines (redactError), per sad.md §8 "No request body or bank detail is logged" (review 2026-09-30-2
// S-01, 2026-09-30-3 U-01). Errors Auth.js catches itself go through its default logger unscrubbed,
// a known exception recorded in sad.md §11 (review 2026-09-30-4 V-01).
//
// Outside production Prisma renders the call site into the backticks (`}).user.update()`), so the
// pattern accepts any text there, not only `prisma.*`.
const PRISMA_INVOCATION = /(Invalid `[^`]*` invocation)[\s\S]*/;
export const REDACTED = ' [arguments redacted]';

export function hasPrismaInvocation(text: string): boolean {
  return PRISMA_INVOCATION.test(text);
}

export function scrubPrismaText(text: string): string {
  return text.replace(PRISMA_INVOCATION, `$1${REDACTED}`);
}

// A request or initialization error ends with the engine's reason ("Can't reach database server",
// "Unique constraint failed on the fields: (`email`)"), which names what went wrong without the
// call arguments, so it is kept for triage (review 2026-09-30-3 U-03). A raw-query failure is cut
// whole: its reason quotes the driver message, and that can quote row values.
const REASON_SAFE_TYPES = new Set([
  'PrismaClientKnownRequestError',
  'PrismaClientInitializationError',
]);
const UNSAFE_REASON = /^Raw query failed/;

/** scrubPrismaText, keeping the final reason paragraph for the error types that carry one safely. */
export function scrubPrismaError(
  type: string | undefined,
  text: string
): string {
  const match =
    type && REASON_SAFE_TYPES.has(type) ? PRISMA_INVOCATION.exec(text) : null;
  if (!match) return scrubPrismaText(text);
  const paragraphs = match[0].split(/\n\s*\n/).map((p) => p.trim());
  const reason = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : '';
  if (!reason || UNSAFE_REASON.test(reason)) return scrubPrismaText(text);
  return `${text.slice(0, match.index)}${match[1]}${REDACTED}\n\n${reason}`;
}

/** The Prisma error code (P1001, P2002, ...) of a thrown value, if it has one. */
export function prismaErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? code : undefined;
}

const MAX_CAUSE_DEPTH = 5;

/**
 * What a server log line may carry for a caught error: the error itself when it holds no Prisma
 * call arguments, otherwise a one-line `Name [code]: message` with the arguments cut (a validation
 * error without the invocation line loses its whole message). An Error `cause` is redacted the
 * same way.
 */
export function redactError(error: unknown, depth = 0): unknown {
  if (typeof error === 'string') return scrubPrismaText(error);
  if (!(error instanceof Error)) return error;

  const scrubbed = scrubPrismaError(error.name, error.message);
  const isPrisma = error.name.startsWith('PrismaClient');
  const cause =
    error.cause !== undefined && depth < MAX_CAUSE_DEPTH
      ? redactError(error.cause, depth + 1)
      : error.cause;
  if (!isPrisma && scrubbed === error.message && cause === error.cause)
    return error;

  const message =
    error.name === 'PrismaClientValidationError' && scrubbed === error.message
      ? REDACTED.trim()
      : scrubbed;
  const code =
    'code' in error && typeof error.code === 'string' ? ` [${error.code}]` : '';
  const causeLine =
    error.cause === undefined
      ? ''
      : `\n  [cause] ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}`;
  return `${error.name}${code}: ${message}${causeLine}`;
}
