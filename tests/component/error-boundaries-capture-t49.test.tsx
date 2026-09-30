// @vitest-environment jsdom
// T49 R-05 — segment error boundaries capture only errors without a digest (client-originated);
// server errors carry a digest and were already reported by failed().
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({
  captureException: (...a: unknown[]) => captureException(...a),
}));

import ProtectedError from '@/app/(protected)/error';
import InvoiceEditorError from '@/app/(invoice-editor)/error';

const boundaries: Array<[string, typeof ProtectedError]> = [
  ['(protected)', ProtectedError],
  ['(invoice-editor)', InvoiceEditorError],
];

describe.each(boundaries)('%s error boundary (T49 R-05)', (_n, Boundary) => {
  afterEach(() => captureException.mockClear());

  it('captures a client-originated error (no digest) once', () => {
    const error = new Error('render blew up');
    render(<Boundary error={error} reset={() => {}} />);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it('does not capture a server error that has a digest', () => {
    const error = Object.assign(new Error('x'), { digest: 'abc123' });
    render(<Boundary error={error} reset={() => {}} />);

    expect(captureException).not.toHaveBeenCalled();
  });
});
