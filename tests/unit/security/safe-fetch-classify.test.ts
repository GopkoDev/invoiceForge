// AC-03 (spec.md §5, verbatim): a logo link that "leads (directly or after redirects) to an
// internal or private network address" must never be connected to — refused with the shared
// generic "the logo could not be loaded from this link" message (mapped to refusal code
// UNAVAILABLE, reason=blocked_ip). A non-https link is refused before any lookup, with its own
// specific message (NOT_HTTPS).
//
// test-plan.md rows exercised here (all `unit`):
//   - "private, loopback, link-local and metadata addresses are classified unsafe"
//   - "non-https logo link is refused before any lookup"
//   - "each refusal reason maps to its plain-language warning"
//
// Seam this test assumes (lib/security/safe-fetch.ts, not yet created):
//   export function isPrivateOrInternalAddress(address: string, family: 4 | 6): boolean
//   export function validateFetchUrl(url: string):
//     | { ok: true; hostname: string }
//     | { ok: false; code: 'NOT_HTTPS'; reason: string }
//   export const REFUSAL_MESSAGES: Record<'NOT_HTTPS' | 'NOT_IMAGE' | 'TOO_LARGE' | 'UNAVAILABLE', string>
// This is the smallest seam that lets the range classifier and the URL/scheme gate be checked
// without a network call; sad.md §11's risk row names exactly these normalization forms.
// RATE_LIMITED is intentionally not part of this task's contract: T03's own API contract
// (task file, "API contract") types safeFetchImage's refusal `code` as only
// 'NOT_HTTPS' | 'NOT_IMAGE' | 'TOO_LARGE' | 'UNAVAILABLE' - the per-Freelancer rate limit needs
// the LogoFetchWindow DB model (still a T01 stub per tests/README.md) and is wired in by T05's
// endpoint, not this module.
import { describe, expect, it } from 'vitest';
import { isPrivateOrInternalAddress, validateFetchUrl, REFUSAL_MESSAGES } from '@/lib/security/safe-fetch';

describe('isPrivateOrInternalAddress (AC-03, sad.md §11 risk row)', () => {
  it.each<[string, 4 | 6]>([
    ['169.254.169.254', 4], // cloud metadata
    ['127.0.0.1', 4], // loopback
    ['127.5.5.5', 4], // loopback, wider /8
    ['10.0.0.1', 4], // RFC1918
    ['172.16.0.1', 4], // RFC1918
    ['172.31.255.255', 4], // RFC1918 upper bound
    ['192.168.1.1', 4], // RFC1918
    ['100.64.0.1', 4], // CGNAT
    ['100.127.255.255', 4], // CGNAT upper bound
    ['0.0.0.0', 4], // this-network
    ['169.254.1.1', 4], // link-local
    ['224.0.0.1', 4], // multicast
    ['255.255.255.255', 4], // broadcast
    ['::1', 6], // loopback
    ['::', 6], // unspecified
    ['fc00::1', 6], // ULA
    ['fe80::1', 6], // link-local
    ['::ffff:127.0.0.1', 6], // IPv4-mapped loopback
    ['::ffff:10.0.0.1', 6], // IPv4-mapped RFC1918
    ['::ffff:169.254.169.254', 6], // IPv4-mapped metadata
    ['64:ff9b::7f00:1', 6], // NAT64-mapped loopback (64:ff9b::/96 + 127.0.0.1)
    ['192.0.0.1', 4], // IETF protocol assignments, 192.0.0.0/24 (F-23)
    ['198.18.0.1', 4], // benchmarking, 198.18.0.0/15 (F-23)
    ['198.19.255.255', 4], // benchmarking upper bound, 198.18.0.0/15 (F-23)
    ['240.0.0.1', 4], // reserved, 240.0.0.0/4 (F-23)
    ['::0.0.0.1', 6], // IPv4-compatible IPv6, ::/96 (F-23, deprecated but still non-public)
    ['ff02::1', 6], // multicast, ff00::/8 (F-23)
    ['fec0::1', 6], // deprecated site-local, fec0::/10 (F-23)
  ])('classifies %s as unsafe', (address, family) => {
    expect(isPrivateOrInternalAddress(address, family)).toBe(true);
  });

  it.each<[string, 4 | 6]>([
    ['8.8.8.8', 4],
    ['1.1.1.1', 4],
    ['93.184.216.34', 4],
    ['2001:4860:4860::8888', 6],
  ])('classifies public address %s as safe', (address, family) => {
    expect(isPrivateOrInternalAddress(address, family)).toBe(false);
  });
});

describe('validateFetchUrl (AC-03, non-https refused before any lookup)', () => {
  it('accepts an https URL', () => {
    const result = validateFetchUrl('https://example.test/logo.png');
    expect(result.ok).toBe(true);
  });

  it('refuses a plain http URL with NOT_HTTPS, before any DNS lookup', () => {
    const result = validateFetchUrl('http://example.test/logo.png');
    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: 'NOT_HTTPS' })
    );
  });

  it.each(['ftp://example.test/logo.png', 'javascript:alert(1)', '/relative/path.png'])(
    'refuses a non-https scheme %s with NOT_HTTPS',
    (url) => {
      const result = validateFetchUrl(url);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('NOT_HTTPS');
      }
    }
  );

  it('normalizes a decimal IPv4 literal hostname to its dotted form before classification (sad.md §11)', () => {
    const result = validateFetchUrl('https://2130706433/logo.png');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hostname).toBe('127.0.0.1');
    }
  });

  it('normalizes a hex/octal IPv4 literal hostname to its dotted form before classification (sad.md §11)', () => {
    const result = validateFetchUrl('https://0x7f.1/logo.png');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.hostname).toBe('127.0.0.1');
    }
  });
});

describe('REFUSAL_MESSAGES (AC-03, plain-language warnings)', () => {
  // F-24: this is the one refusal-message table - app/api/convert-image/route.ts's REFUSAL_BODIES
  // builds its `error` text from these exact strings (openapi.yaml's LogoFetchRefusal examples),
  // rather than keeping its own separate, untested copy. Route-level coverage for all four codes
  // (including NOT_IMAGE and TOO_LARGE, previously untested there) lives in
  // tests/integration/api/convert-image.test.ts.
  it('gives each named reason its own specific message, matching the contract text verbatim', () => {
    expect(REFUSAL_MESSAGES.NOT_HTTPS).toBe('The logo link is not a secure web address.');
    expect(REFUSAL_MESSAGES.NOT_IMAGE).toBe('The logo file is not an image.');
    expect(REFUSAL_MESSAGES.TOO_LARGE).toBe('The logo file is larger than 512 KB.');
  });

  it('gives unreachable, timeout and private-address refusals the same generic message, revealing nothing', () => {
    expect(REFUSAL_MESSAGES.UNAVAILABLE).toBe('The logo could not be loaded from this link.');
  });

  it('never mentions an address, host or IP in any message', () => {
    for (const message of Object.values(REFUSAL_MESSAGES) as string[]) {
      expect(message).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
      expect(message.toLowerCase()).not.toContain('ip address');
    }
  });
});
