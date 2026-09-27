// T05 (spec.md §5 AC-01/AC-02/AC-02b/AC-03, ADR-0003, ADR-0008) — fetch only the logo stored on
// a sender profile the caller owns, never a URL from the request body.
//
// Order of checks (sad.md §6 flow 1, openapi.yaml operationId convertLogoImage, abridged):
//   session -> live account -> parse body -> profile owned & has a logo -> rate limit (counts
//   only after ownership, before the outbound fetch) -> safe fetch -> map refusal codes.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/helpers/route-auth';
import { prisma } from '@/prisma';
import { consumeLogoFetch } from '@/lib/security/logo-rate-limit';
import { safeFetchImage, type SafeFetchRefusalCode } from '@/lib/security/safe-fetch';

const LogoFetchRequestSchema = z
  .object({ senderProfileId: z.string().min(1).max(64) })
  .strict();

const NOT_FOUND_BODY = { success: false, code: 'NOT_FOUND', error: 'Sender profile not found.' } as const;

const REFUSAL_BODIES: Record<SafeFetchRefusalCode, { status: number; body: { success: false; code: SafeFetchRefusalCode; error: string } }> = {
  NOT_HTTPS: { status: 422, body: { success: false, code: 'NOT_HTTPS', error: 'The logo link is not a secure web address.' } },
  NOT_IMAGE: { status: 422, body: { success: false, code: 'NOT_IMAGE', error: 'The logo file is not an image.' } },
  TOO_LARGE: { status: 422, body: { success: false, code: 'TOO_LARGE', error: 'The logo file is larger than 512 KB.' } },
  UNAVAILABLE: { status: 502, body: { success: false, code: 'UNAVAILABLE', error: 'The logo could not be loaded from this link.' } },
};

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (!session.ok) {
    return session.response;
  }
  const { userId } = session;

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

  const profile = await prisma.senderProfile.findFirst({
    where: { id: senderProfileId, userId },
    select: { logo: true },
  });

  if (!profile || !profile.logo) {
    return NextResponse.json(NOT_FOUND_BODY, { status: 404 });
  }

  let rateLimit;
  try {
    rateLimit = await consumeLogoFetch(userId);
  } catch (error) {
    console.error('logo_rate_limit_store_error', error);
    return NextResponse.json(REFUSAL_BODIES.UNAVAILABLE.body, { status: REFUSAL_BODIES.UNAVAILABLE.status });
  }

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, code: 'RATE_LIMITED', error: 'Too many requests, try again in a minute.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const result = await safeFetchImage(profile.logo);

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
