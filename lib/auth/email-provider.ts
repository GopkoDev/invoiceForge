// Auth.js email provider hooks (ADR-0001; sad.md §6 flow 1): the one enforcement point for the
// address rule, the sign-in-email limits, the response floor and the TLS-only send.
// Never logs or reports a raw address or network address.
import * as Sentry from '@sentry/nextjs';
import { CredentialsSignin } from 'next-auth';
import type { PrismaClient } from '@prisma/client';
import { loginEmailSchema } from '@/lib/validations/auth';
import {
  createLimitStore,
  LimitStoreUnavailable,
} from '@/lib/security/limits/limit-store';
import { createLockoutAlert } from '@/lib/security/limits/lockout-alert';
import { LIMIT_SCOPES } from '@/lib/security/limits/scopes';
import {
  addressLimitKey,
  clientSource,
  sourceLimitKey,
} from '@/lib/security/limits/keys';
import { SIGN_IN_ERROR_CODES } from '@/lib/auth/sign-in-messages';

/**
 * Base of the typed provider errors (ADR-0001: the error type decides, never the message text).
 * They are Auth.js CredentialsSignin errors, the one Auth.js error type that carries a
 * client-safe `code` (OQ-2, pinned on next-auth 5.0.0-beta.32 / @auth/core 0.41.3):
 * - signIn() in raw mode (the /login action) rethrows an AuthError as-is, so the action sees
 *   these classes. A plain Error would become a redirect to `?error=Configuration` instead.
 * - the direct endpoint passes only client-safe types to the client, so it redirects to
 *   `/error?error=CredentialsSignin&code=<code>` (`kind = 'error'` picks pages.error).
 */
abstract class SignInRefused extends CredentialsSignin {
  static kind = 'error' as const;
}

export class InvalidEmailAddress extends SignInRefused {
  code = SIGN_IN_ERROR_CODES.invalidEmail;
  constructor() {
    super('Enter a valid email address.');
    this.name = 'InvalidEmailAddress';
  }
}

export class EmailSigninUnavailable extends SignInRefused {
  code = SIGN_IN_ERROR_CODES.unavailable;
  constructor() {
    super('Sign-in by email is temporarily unavailable');
    this.name = 'EmailSigninUnavailable';
  }
}

export class EmailSendFailed extends SignInRefused {
  code = SIGN_IN_ERROR_CODES.sendFailed;
  constructor() {
    super('Could not send the sign-in email');
    this.name = 'EmailSendFailed';
  }
}

export interface MailTransport {
  sendMail(message: {
    to: string;
    from: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

export interface EmailProviderOptions {
  prisma?: PrismaClient;
  transport?: MailTransport;
  /** Response floor F in ms (default 1000, capped at 1200). */
  floorMs?: number;
  /** Upper bound of the random jitter added to the floor, in ms. */
  jitterMs?: number;
}

export interface SendVerificationParams {
  identifier: string;
  url: string;
  provider: { from?: string };
  request: Request;
}

const DEFAULT_FLOOR_MS = 1000;
const MAX_FLOOR_MS = 1200;
const DEFAULT_JITTER_MS = 50;
/** Hard bound on one SMTP send; the address lock's transaction outlives it. */
const SEND_TIMEOUT_MS = 10_000;
const ADDRESS_LOCK_TIMEOUT_MS = 30_000;
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('send timed out')), ms);
  });
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function defaultTransport(): Promise<MailTransport> {
  const [{ createTransport }, { getEmailServerConfig }] = await Promise.all([
    import('nodemailer'),
    import('@/lib/get-email-server-config'),
  ]);
  return createTransport({
    ...getEmailServerConfig(),
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });
}

type Outcome = 'sent' | 'limited' | 'invalid' | 'unavailable' | 'failed';

function withSpan<T>(run: (setOutcome: (o: Outcome) => void) => T): T {
  return Sentry.startSpan({ name: 'auth.signin.email', op: 'auth' }, (span) =>
    run((outcome) => span.setAttribute('outcome', outcome))
  );
}

export function createEmailProviderHooks(options: EmailProviderOptions = {}) {
  const floorMs = Math.min(options.floorMs ?? DEFAULT_FLOOR_MS, MAX_FLOOR_MS);
  const jitterMs = options.jitterMs ?? DEFAULT_JITTER_MS;
  const storeOverrides = options.prisma ? { prisma: options.prisma } : {};
  const store = createLimitStore(storeOverrides);
  const alert = createLockoutAlert(storeOverrides);
  let transport = options.transport;

  function normalizeIdentifier(identifier: string): string {
    return withSpan((setOutcome) => {
      const email = identifier.trim().toLowerCase();
      if (!loginEmailSchema.safeParse({ email }).success) {
        setOutcome('invalid');
        throw new InvalidEmailAddress();
      }
      return email;
    });
  }

  /** Counts this request for the source; false when the source is already at its limit. */
  const admitSource = (sourceKey: string) =>
    store.withKeyLock('SIGNIN_SOURCE', sourceKey, async (limit) => {
      if ((await limit.countInWindow()) >= LIMIT_SCOPES.SIGNIN_SOURCE.max)
        return false;
      await limit.record('REQUESTED');
      return true;
    });

  /**
   * Counts, sends and records SENT under one SIGNIN_ADDRESS lock (ADR-0002 §Decision 1), so
   * concurrent requests for one address queue instead of sending past the limit. The send is
   * bounded by SEND_TIMEOUT_MS, well inside the lock's transaction timeout.
   */
  const sendUnderAddressLimit = (
    addressKey: string,
    send: () => Promise<unknown>
  ) =>
    store.withKeyLock(
      'SIGNIN_ADDRESS',
      addressKey,
      async (limit): Promise<'sent' | 'limited'> => {
        if ((await limit.countInWindow()) >= LIMIT_SCOPES.SIGNIN_ADDRESS.max)
          return 'limited';
        try {
          await withTimeout(send(), SEND_TIMEOUT_MS);
        } catch {
          throw new EmailSendFailed();
        }
        await limit.record('SENT');
        return 'sent';
      },
      { timeoutMs: ADDRESS_LOCK_TIMEOUT_MS }
    );

  async function sendVerificationRequest(
    params: SendVerificationParams
  ): Promise<void> {
    const started = Date.now();
    const holdToFloor = () =>
      sleep(
        Math.max(0, started + floorMs + Math.random() * jitterMs - Date.now())
      );

    return withSpan(async (setOutcome) => {
      const { identifier, url, provider, request } = params;
      const addressKey = addressLimitKey(identifier);
      const host = new URL(url).host;
      const sendLink = async () => {
        transport ??= await defaultTransport();
        return transport.sendMail({
          to: identifier,
          from: provider.from ?? '',
          subject: `Sign in to ${host}`,
          text: `Sign in to ${host}\n${url}\n\n`,
          html: `<p>Sign in to ${escapeHtml(host)}</p><p><a href="${escapeHtml(url)}">Sign in</a></p>`,
        });
      };

      let outcome: 'sent' | 'limited';
      try {
        const sourceKey = sourceLimitKey(clientSource(request) ?? 'unknown');
        if (!(await admitSource(sourceKey))) {
          outcome = 'limited';
        } else {
          outcome = await sendUnderAddressLimit(addressKey, sendLink);
          // Outside the address lock: the alert takes the same key's lock itself.
          if (outcome === 'limited')
            await alert.onAddressLimited(addressKey, new Date());
        }
      } catch (error) {
        if (error instanceof EmailSendFailed) {
          setOutcome('failed');
          Sentry.captureException(error);
          throw error;
        }
        if (!(error instanceof LimitStoreUnavailable)) throw error;
        setOutcome('unavailable');
        Sentry.captureException(new EmailSigninUnavailable());
        throw new EmailSigninUnavailable();
      }

      setOutcome(outcome);
      await holdToFloor();
    });
  }

  return { normalizeIdentifier, sendVerificationRequest };
}
