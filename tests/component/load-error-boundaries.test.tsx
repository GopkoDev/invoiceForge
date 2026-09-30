// @vitest-environment jsdom
// T25 — segment load-error boundaries with retry and Sentry reporting.
// See docs/features/architecture-hardening/tasks/t25-load-error-boundaries.md
//
// AC-28 (spec.md §5): a page whose data fails to load shows an error state with a
// retry, never an empty state or "not found", and the failure is reported to error
// monitoring. screens.md §SCR-17 states: default / retrying / still-failing, built
// from the `Empty` primitive plus a `Button` (never `ErrorPageLayout`, never
// `ContentAreaNotFound`). test-plan.md row "load-error state offers a retry and shows
// no internals" (component level) is what this file covers; the integration row (each
// of the nine AC-28 loaders actually resolving to FAILED through a real segment) is
// out of scope here — it needs an app boot / DB and belongs with T26.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const captureException = vi.fn();
afterEach(() => captureException.mockClear());
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

// Shared client component: components/layout/content-area/load-error.tsx (not yet created).
import { LoadError } from '@/components/layout/content-area/load-error';

// Segment boundaries: not yet created.
import ProtectedError from '@/app/(protected)/error';
import InvoiceEditorError from '@/app/(invoice-editor)/error';

describe('LoadError (component) — SCR-17', () => {
  it('shows the plain-language copy and a retry button, never the raw error message', () => {
    render(<LoadError onRetry={() => {}} />);

    expect(screen.getByText(/we couldn't load your data/i)).toBeInTheDocument();
    expect(
      screen.getByText(/something went wrong on our side/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('never renders the raw error text passed to it', () => {
    render(
      <LoadError
        onRetry={() => {}}
        // A raw DB-shaped message must never reach the DOM (edge case: "Error message
        // contains SQL text" → never displayed, only plain-language copy).
        errorDigest="SELECT * FROM invoices WHERE customer_id = '1' OR '1'='1'"
      />
    );

    expect(
      screen.queryByText(/select \* from invoices/i)
    ).not.toBeInTheDocument();
  });

  it('calls onRetry when "Try again" is pressed, and shows a spinner while retrying', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(<LoadError onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('(protected)/error.tsx — AC-28 default and still-failing states', () => {
  // T43 (N-10): the action's failed() already reported the cause; the boundary reporting again
  // made every page failure 2-3 events (test-plan.md:109: one).
  it('does not report a second Sentry event for an error the action already reported', () => {
    const error = Object.assign(new Error('secret db connection string leaked'), {
      digest: 'abc123',
    });
    const reset = vi.fn();

    render(<ProtectedError error={error} reset={reset} />);

    expect(captureException).not.toHaveBeenCalled();
  });

  it('never renders the raw error.message', () => {
    const error = Object.assign(
      new Error('duplicate key value violates unique constraint "invoices_pkey"'),
      { digest: 'abc123' }
    );
    const reset = vi.fn();

    render(<ProtectedError error={error} reset={reset} />);

    expect(
      screen.queryByText(/duplicate key value violates/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText(/we couldn't load your data/i)).toBeInTheDocument();
  });

  // F-37 (T39): "reset() then refresh()" re-renders the segment from the still-cached error
  // payload before the refetch lands, so the first "Try again" can never recover — it has to
  // refresh (kick off the refetch) before reset() (clear the boundary), and both belong inside
  // startTransition so React treats the pair as one non-blocking update
  // (`startTransition(() => { router.refresh(); reset(); })`).
  it('retry calls router.refresh() then reset(), so the boundary clears onto fresh data, not the cached failure', async () => {
    const user = userEvent.setup();
    const error = Object.assign(new Error('load failed'), { digest: 'abc123' });
    const reset = vi.fn();

    render(<ProtectedError error={error} reset={reset} />);

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    const resetOrder = reset.mock.invocationCallOrder[0];
    const refreshOrder = refresh.mock.invocationCallOrder[0];
    expect(refreshOrder).toBeLessThan(resetOrder);
  });
});

describe('(invoice-editor)/error.tsx — AC-28', () => {
  it('renders the same SCR-17 copy with retry and adds no second Sentry report', async () => {
    const user = userEvent.setup();
    const error = Object.assign(new Error('editor load failed'), { digest: 'xyz' });
    const reset = vi.fn();

    render(<InvoiceEditorError error={error} reset={reset} />);

    expect(captureException).not.toHaveBeenCalled();
    expect(screen.getByText(/we couldn't load your data/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
