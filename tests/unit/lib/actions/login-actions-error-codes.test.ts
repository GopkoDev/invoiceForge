// T40 — F-50 (docs/features/architecture-hardening/_review/review-2026-09-27.md, Group 8;
// T08 DoD): signInWithEmail must return the shared ActionResult shape (types/actions.ts), with a
// `code` on failure, like every other server action in the app — not a bespoke
// `{ success: false, error }` with no code.
//
// RED (F-50 not yet fixed): lib/actions/login-actions.ts:14-17 returns a plain object literal
// with no `code` field on a validation failure.
import { describe, expect, it, vi } from 'vitest';

// login-actions.ts imports `signIn` from '@/auth', which pulls in next-auth's full server
// bundle (unavailable/unresolvable in this unit environment) — mocked the same way every other
// action test that touches '@/auth' does.
vi.mock('@/auth', () => ({ signIn: vi.fn() }));

const { signInWithEmail } = await import('@/lib/actions/login-actions');

describe('signInWithEmail — ActionResult error codes (T40, F-50)', () => {
  it('returns a VALIDATION code alongside the message when the email fails schema validation', async () => {
    const result = await signInWithEmail('not-an-email');

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('VALIDATION');
    expect(result.error).toBeTruthy();
  });
});
