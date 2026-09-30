// Prisma error messages embed the rendered call arguments (`email: "..."`), and `errorFormat`
// cannot remove them: 'minimal' still includes them. They are cut before an error leaves the
// process, whether to Sentry (sentry.server.config.ts) or to the server logs (redactError), per
// sad.md §8 "No request body or bank detail is logged" (review 2026-09-30-2 S-01, 2026-09-30-3 U-01).
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

  const scrubbed = scrubPrismaText(error.message);
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
