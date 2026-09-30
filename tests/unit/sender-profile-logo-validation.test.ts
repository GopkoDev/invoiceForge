// T20 (spec.md §5 AC-04) — senderProfileFormSchema rejects a non-https `logo` link.
//
// docs/features/architecture-hardening/tasks/t20-sender-profile-https-logo.md, Inlined context
// (contracts/server-actions.md §updateSenderProfile / createSenderProfile, verbatim) and
// test-plan.md row "sender profile schema rejects a non-https logo link" (unit, AC-04):
// http:, ftp:, javascript: and a relative path are rejected with "must be a secure web
// address"; an empty value is allowed.
//
// RED (T20 not yet implemented): today's `logo` field is
// `optionalString(z.string().trim().url('Invalid URL format'))` — it accepts any well-formed
// URL (including http:, ftp:, javascript:) and only rejects malformed/relative strings, with
// the wrong message ("Invalid URL format", not the contract's secure-address wording).
import { describe, expect, it } from 'vitest';
import { senderProfileFormSchema } from '@/lib/validations/sender-profile';

const CONTRACT_MESSAGE = 'The link must be a secure web address (https://…).';

function baseProfile(logo: string) {
  return {
    name: 'Acme LLC',
    legalName: '',
    taxId: '',
    address: '',
    city: '',
    country: '',
    postalCode: '',
    phone: '',
    email: '',
    website: '',
    logo,
    invoicePrefix: 'INV',
    isDefault: false,
  };
}

function logoMessages(result: ReturnType<typeof senderProfileFormSchema.safeParse>): string[] {
  if (result.success) return [];
  return result.error.issues
    .filter((issue) => issue.path.join('.') === 'logo')
    .map((issue) => issue.message);
}

describe('senderProfileFormSchema — logo must be a secure (https) web address (AC-04)', () => {
  it('accepts an https logo URL', () => {
    const result = senderProfileFormSchema.safeParse(baseProfile('https://example.com/logo.png'));
    expect(result.success).toBe(true);
  });

  it('accepts an empty logo (no logo)', () => {
    const result = senderProfileFormSchema.safeParse(baseProfile(''));
    expect(result.success).toBe(true);
  });

  it('accepts a logo URL whose protocol is https regardless of case (HTTPS://…)', () => {
    const result = senderProfileFormSchema.safeParse(
      baseProfile('HTTPS://EXAMPLE.COM/x.png')
    );
    expect(result.success).toBe(true);
  });

  it.each([
    ['http://example.com/logo.png'],
    ['ftp://example.com/logo.png'],
    ['javascript:alert(1)'],
    ['data:image/png;base64,abc123'],
    ['/relative/path/logo.png'],
    ['not a url at all'],
  ])('rejects %s with the contract message on the logo path', (badLogo) => {
    const result = senderProfileFormSchema.safeParse(baseProfile(badLogo));

    expect(result.success).toBe(false);
    expect(logoMessages(result)).toEqual([CONTRACT_MESSAGE]);
  });
});
