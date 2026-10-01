// T05 (spec.md §5 AC-01/AC-02/AC-02b/AC-03, ADR-0003, ADR-0008) — fetch only the logo stored on
// a sender profile the caller owns, never a URL from the request body.
//
// Order of checks (sad.md §6 flow 1, openapi.yaml operationId convertLogoImage, abridged):
//   session -> live account -> parse body -> profile owned & has a logo -> stored link's own
//   scheme (F-21: a NOT_HTTPS refusal here must never spend quota) -> rate limit (counts only
//   after ownership and the scheme check, before the outbound fetch) -> safe fetch -> map
//   refusal codes.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { actingFreelancerForRoute } from '@/lib/helpers/session-actor';
import { getSenderProfileLogo } from '@/lib/services/sender-profiles/sender-profiles';
import { consumeLogoFetch } from '@/lib/security/logo-rate-limit';
import { redactError } from '@/lib/helpers/prisma-error-scrub';
import {
  safeFetchImage,
  validateFetchUrl,
  REFUSAL_MESSAGES,
  logOutcome,
  type SafeFetchRefusalCode,
} from '@/lib/security/safe-fetch';

const LogoFetchRequestSchema = z
  .object({ senderProfileId: z.string().min(1).max(64) })
  .strict();

const NOT_FOUND_BODY = { success: false, code: 'NOT_FOUND', error: 'Sender profile not found.' } as const;

// F-24: the response text comes from safe-fetch.ts's REFUSAL_MESSAGES - the one refusal-message
// table - rather than a separate, untested copy of the same strings.
const REFUSAL_BODIES: Record<SafeFetchRefusalCode, { status: number; body: { success: false; code: SafeFetchRefusalCode; error: string } }> = {
  NOT_HTTPS: { status: 422, body: { success: false, code: 'NOT_HTTPS', error: REFUSAL_MESSAGES.NOT_HTTPS } },
  NOT_IMAGE: { status: 422, body: { success: false, code: 'NOT_IMAGE', error: REFUSAL_MESSAGES.NOT_IMAGE } },
  TOO_LARGE: { status: 422, body: { success: false, code: 'TOO_LARGE', error: REFUSAL_MESSAGES.TOO_LARGE } },
  UNAVAILABLE: { status: 502, body: { success: false, code: 'UNAVAILABLE', error: REFUSAL_MESSAGES.UNAVAILABLE } },
};

export async function POST(request: NextRequest) {
  const session = await actingFreelancerForRoute();
  if (!session.ok) {
    return session.response;
  }
  const { actor } = session;
  const { userId } = actor;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, code: 'VALIDATION', error: 'The request is invalid.' },
      { status: 400 }
    );
  }

  const parsed = LogoFetchRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, code: 'VALIDATION', error: 'The request is invalid.' },
      { status: 400 }
    );
  }
  const { senderProfileId } = parsed.data;

  const profile = await getSenderProfileLogo(actor, senderProfileId);
  if (!profile.success && profile.code !== 'NOT_FOUND') {
    // A lookup failure was an unhandled 500 before the move; keep the status. The service's
    // failed() already reported it, so return a response instead of throwing a second event.
    return NextResponse.json(
      { success: false, code: 'FAILED', error: 'Sender profile logo lookup failed.' },
      { status: 500 }
    );
  }

  if (!profile.success || !profile.data.logo) {
    return NextResponse.json(NOT_FOUND_BODY, { status: 404 });
  }
  const logo = profile.data.logo;

  // F-21: a refusal that would happen before any real fetch (the stored link's own scheme) must
  // not spend the caller's quota - only real fetch attempts count towards the limit.
  const scheme = validateFetchUrl(logo);
  if (!scheme.ok) {
    // N-19: this short-circuit skips safeFetchImage, so it logs the refusal itself.
    logOutcome(scheme.code, scheme.reason);
    const refusal = REFUSAL_BODIES.NOT_HTTPS;
    return NextResponse.json(refusal.body, { status: refusal.status });
  }

  let rateLimit;
  try {
    rateLimit = await consumeLogoFetch(userId);
  } catch (error) {
    console.error('logo_rate_limit_store_error', redactError(error));
    return NextResponse.json(REFUSAL_BODIES.UNAVAILABLE.body, { status: REFUSAL_BODIES.UNAVAILABLE.status });
  }

  if (!rateLimit.allowed) {
    logOutcome('RATE_LIMITED', 'rate_limit');
    return NextResponse.json(
      { success: false, code: 'RATE_LIMITED', error: 'Too many requests, try again in a minute.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const result = await safeFetchImage(logo);

  if (!result.ok) {
    const refusal = REFUSAL_BODIES[result.code];
    return NextResponse.json(refusal.body, { status: refusal.status });
  }

  const dataUrl = `data:${result.contentType};base64,${result.bytes.toString('base64')}`;

  return NextResponse.json({
    success: true,
    data: {
      dataUrl,
      contentType: result.contentType,
      size: result.bytes.byteLength,
    },
  });
}
