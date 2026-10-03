// T16 (spec.md §5 AC-21; contracts/server-actions.md §Web-address rule) — one shared http(s)-only rule.
import { describe, expect, it } from 'vitest';
import {
  isWebAddress,
  WEB_ADDRESS_MESSAGE,
} from '@/lib/validations/web-address';
import { customerFormSchema } from '@/lib/validations/customer';
import { senderProfileFormSchema } from '@/lib/validations/sender-profile';
import { profileFormSchema } from '@/lib/validations/profile';

describe('isWebAddress (AC-21)', () => {
  it.each([
    ['https://a.b', true],
    ['http://a.b', true],
    ['HTTPS://a.b', true],
    ['javascript:alert(1)', false],
    ['JavaScript:alert(1)', false],
    ['data:image/png;base64,AAAA', false],
    ['ftp://x', false],
    ['//x', false],
    ['x', false],
    [' https://x', false],
    ['https://x ', false],
    ['', false],
  ])('%j -> %s', (value, expected) => {
    expect(isWebAddress(value)).toBe(expected);
  });

  it('exports the contract message', () => {
    expect(WEB_ADDRESS_MESSAGE).toBe(
      'The address must start with http:// or https://.'
    );
  });
});

const MSG = 'The address must start with http:// or https://.';
const customerBase = { name: 'Acme', defaultCurrency: 'USD' };
const senderBase = { name: 'S', invoicePrefix: 'AB' };
const profileBase = { name: 'N', email: 'a@b.co' };

describe('schemas use the rule (AC-21)', () => {
  it.each(['website', 'image'] as const)(
    'customer %s refuses javascript:/data: with the message',
    (field) => {
      for (const bad of ['javascript:alert(1)', 'data:text/html,x']) {
        const r = customerFormSchema.safeParse({
          ...customerBase,
          [field]: bad,
        });
        expect(r.success).toBe(false);
        if (!r.success)
          expect(r.error.flatten().fieldErrors[field]).toEqual([MSG]);
      }
    }
  );

  it('customer accepts https, trimmed spaces and empty', () => {
    expect(
      customerFormSchema.safeParse({
        ...customerBase,
        website: ' https://x.io ',
        image: '',
      }).success
    ).toBe(true);
  });

  it('sender-profile website refuses javascript: with the message', () => {
    const r = senderProfileFormSchema.safeParse({
      ...senderBase,
      website: 'javascript:alert(1)',
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.flatten().fieldErrors.website).toEqual([MSG]);
  });

  it('sender-profile accepts http website but logo stays https-only', () => {
    expect(
      senderProfileFormSchema.safeParse({
        ...senderBase,
        website: 'http://x.io',
      }).success
    ).toBe(true);
    const r = senderProfileFormSchema.safeParse({
      ...senderBase,
      logo: 'http://x.io/l.png',
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.flatten().fieldErrors.logo).toEqual([
        'The link must be a secure web address (https://…).',
      ]);
  });

  it('profile image refuses data: with the message, allows empty and https', () => {
    const r = profileFormSchema.safeParse({
      ...profileBase,
      image: 'data:image/png;base64,AAAA',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.image).toEqual([MSG]);
    expect(
      profileFormSchema.safeParse({ ...profileBase, image: '' }).success
    ).toBe(true);
    expect(
      profileFormSchema.safeParse({
        ...profileBase,
        image: 'https://x.io/a.png',
      }).success
    ).toBe(true);
  });
});
