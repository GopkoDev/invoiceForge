// @vitest-environment jsdom
// T43 (review-2026-09-28.md N-17, AC-28, screens.md SCR-17 "retrying"): startTransition is
// synchronous, so the retrying spinner never showed and a double click could retry twice. The
// boundaries take isPending from useTransition and pass it to LoadError as `retrying`.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let pending = true;
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useTransition: () => [pending, (cb: () => void) => cb()] as const,
  };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import ProtectedError from '@/app/(protected)/error';
import InvoiceEditorError from '@/app/(invoice-editor)/error';
import { LoadError } from '@/components/layout/content-area/load-error';

const error = Object.assign(new Error('x'), { digest: 'd' });

describe.each([
  ['(protected)/error.tsx', ProtectedError],
  ['(invoice-editor)/error.tsx', InvoiceEditorError],
])('%s retrying state (T43, N-17)', (_name, Boundary) => {
  it('disables Try again while the refresh transition is pending', () => {
    pending = true;
    render(<Boundary error={error} reset={vi.fn()} />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeDisabled();
  });

  it('enables Try again when nothing is pending', () => {
    pending = false;
    render(<Boundary error={error} reset={vi.fn()} />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled();
  });
});

describe('LoadError retrying prop (T43, N-17)', () => {
  it('shows the disabled state when retrying is true', () => {
    render(<LoadError onRetry={() => {}} retrying />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeDisabled();
  });
});
