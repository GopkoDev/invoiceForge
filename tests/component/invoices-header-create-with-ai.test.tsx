// @vitest-environment jsdom
// T19 (ai-assistant; AC-33) — the invoice list header gains an outline "Create with AI" link (sparkles icon)
// to /ai?start=draft, placed before "New Invoice"; always shown (AC-34 is handled on arrival at SCR-01).
// See docs/features/ai-assistant/tasks/t19-create-with-ai-entry-and-assistant-mark.md and screens.md §SCR-05.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/modals/invoice/invoice-modal-container', () => ({ InvoiceModalContainer: () => null }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/invoices',
  useSearchParams: () => new URLSearchParams(),
}));

import InvoicesLayout from '@/app/(protected)/invoices/layout';

describe('invoices layout header (AC-33)', () => {
  it('links "Create with AI" to /ai?start=draft, before "New Invoice"', () => {
    render(<InvoicesLayout>{<p>child</p>}</InvoicesLayout>);
    const ai = screen.getByRole('link', { name: /Create with AI/ });
    const neu = screen.getByRole('link', { name: /New Invoice/ });
    expect(ai.getAttribute('href')).toBe('/ai?start=draft');
    expect(neu.getAttribute('href')).toBe('/invoices/new');
    expect(ai.compareDocumentPosition(neu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is an outline-styled link, distinct from the primary New Invoice button', () => {
    render(<InvoicesLayout>{<p>child</p>}</InvoicesLayout>);
    const ai = screen.getByRole('link', { name: /Create with AI/ });
    const neu = screen.getByRole('link', { name: /New Invoice/ });
    expect(ai.className).toContain('border');
    expect(ai.className).not.toBe(neu.className);
    expect(ai.querySelector('svg')).toBeTruthy();
  });
});
