// Auth.js email provider hooks (ADR-0001; sad.md §6 flow 1): the one enforcement point for the
// address rule, the sign-in-email limits, the response floor and the TLS-only send.
// The source limit runs in callbacks.signIn (signInCallback), before Auth.js writes a
// VerificationToken; the address limit and the send run in sendVerificationRequest.
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
  /** Response floor F in ms (default: SIGNIN_RESPONSE_FLOOR_MS, else 1000; capped at 1200). */
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

/** The part of Auth.js's callbacks.signIn params this callback reads. */
export interface SignInCallbackParams {
  account?: { type?: string } | null;
  email?: { verificationRequest?: boolean };
}

const DEFAULT_FLOOR_MS = 1000;
const MAX_FLOOR_MS = 1200;
const DEFAULT_JITTER_MS = 50;
/** Hard bound on one SMTP send. */
const SEND_TIMEOUT_MS = 10_000;
/** Where Auth.js sends a sent request; a source-limited one gets the very same redirect. */
const VERIFY_REQUEST_PATH =
  '/api/auth/verify-request?provider=nodemailer&type=email';
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * F-21: the floor F from the optional SIGNIN_RESPONSE_FLOOR_MS setting (the p90 send time
 * measured on preview), clamped to at most 1200 ms; an unset or unusable value gives 1000 ms.
 */
export function responseFloorMs(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env.SIGNIN_RESPONSE_FLOOR_MS;
  const value = raw ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value < 0) return DEFAULT_FLOOR_MS;
  return Math.min(value, MAX_FLOOR_MS);
}

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

function withSpan<T>(
  run: (setOutcome: (o: Outcome) => void) => T,
  startTime?: number
): T {
  return Sentry.startSpan(
    {
      name: 'auth.signin.email',
      op: 'auth',
      ...(startTime === undefined ? {} : { startTime: new Date(startTime) }),
    },
    (span) => run((outcome) => span.setAttribute('outcome', outcome))
  );
}

export function createEmailProviderHooks(options: EmailProviderOptions = {}) {
  const floorMs = Math.min(options.floorMs ?? responseFloorMs(), MAX_FLOOR_MS);
  const jitterMs = options.jitterMs ?? DEFAULT_JITTER_MS;
  const storeOverrides = options.prisma ? { prisma: options.prisma } : {};
  const store = createLimitStore(storeOverrides);
  const alert = createLockoutAlert(storeOverrides);
  let transport = options.transport;

  /** Holds a response until F (+ jitter) after `started`; a slower path is not held further. */
  const holdToFloor = (started: number) =>
    sleep(
      Math.max(0, started + floorMs + Math.random() * jitterMs - Date.now())
    );

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
   * F-18: the source limit, run from callbacks.signIn before Auth.js creates a VerificationToken.
   * A limited source is held to the floor and gets the same redirect as a sent request.
   */
  async function admitSignInRequest(headers: Headers): Promise<true | string> {
    const started = Date.now();
    const ip = clientSource(headers);
    if (!ip) {
      // F-19: no platform address must not pool every such request into one shared bucket.
      // The address limit still applies; the gap is reported so it is seen, never silent.
      Sentry.captureMessage(
        'auth.signin.email: request without a platform client address',
        'warning'
      );
      return true;
    }
    try {
      if (await admitSource(sourceLimitKey(ip))) return true;
    } catch (error) {
      if (!(error instanceof LimitStoreUnavailable)) throw error;
      // An error thrown here reaches the Visitor only as AccessDenied. The send hook raises the
      // typed AC-15 error instead: its address lock meets the same unavailable store.
      return true;
    }
    return withSpan(async (setOutcome) => {
      setOutcome('limited');
      await holdToFloor(started);
      return VERIFY_REQUEST_PATH;
    }, started);
  }

  /** Auth.js callbacks.signIn: only a Sign-in link request is subject to the source limit. */
  function signInCallback(getHeaders: () => Promise<Headers>) {
    return async ({
      account,
      email,
    }: SignInCallbackParams): Promise<true | string> => {
      if (account?.type !== 'email' || !email?.verificationRequest) return true;
      return admitSignInRequest(await getHeaders());
    };
  }

  /**
   * F-17: counts the address and inserts a SENT reservation under one SIGNIN_ADDRESS lock
   * (ADR-0002 §Decision 1), then commits, so concurrent requests for one address queue only
   * for the count, never for the SMTP send.
   */
  const reserveAddress = (addressKey: string) =>
    store.withKeyLock(
      'SIGNIN_ADDRESS',
      addressKey,
      async (limit): Promise<{ id: string } | 'limited'> => {
        if ((await limit.countInWindow()) >= LIMIT_SCOPES.SIGNIN_ADDRESS.max)
          return 'limited';
        return limit.record('SENT');
      }
    );

  /** Sends outside any transaction; a failed send releases its reservation (it never counts). */
  async function sendOrRelease(
    reservationId: string,
    send: () => Promise<unknown>
  ): Promise<void> {
    try {
      await withTimeout(send(), SEND_TIMEOUT_MS);
    } catch {
      await store.release(reservationId).catch(() => {
        Sentry.captureException(new LimitStoreUnavailable());
      });
      throw new EmailSendFailed();
    }
  }

  async function sendVerificationRequest(
    params: SendVerificationParams
  ): Promise<void> {
    const started = Date.now();

    return withSpan(async (setOutcome) => {
      const { identifier, url, provider } = params;
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
        const reservation = await reserveAddress(addressKey);
        if (reservation === 'limited') {
          outcome = 'limited';
          // Outside the address lock: the alert takes the same key's lock itself.
          await alert.onAddressLimited(addressKey, new Date());
        } else {
          await sendOrRelease(reservation.id, sendLink);
          outcome = 'sent';
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
      await holdToFloor(started);
    });
  }

  return { normalizeIdentifier, sendVerificationRequest, signInCallback };
}
