// @vitest-environment jsdom
// T24 (ai-chat-v2; AC-23, AC-26b) - SCR-07 IssueConfirmation: the body of the canon ConfirmationModal names the
// Customer, the total and the currency from the loaded preview, and the fixed sentence.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { IssueConfirmation } from '@/components/ai/issue-confirmation';

afterEach(cleanup);

describe('IssueConfirmation (SCR-07)', () => {
  it('names the Customer, the total with its currency, and the fixed sentence', () => {
    const { container } = render(<IssueConfirmation customerName="Acme Corp" total={1000} currency="USD" />);
    const text = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(screen.getByText('Acme Corp')).toBeTruthy();
    expect(text).toContain('Customer');
    expect(text).toContain('Total');
    expect(text).toContain('1,000.00 USD');
    expect(text).toContain("Once it's issued, its lines and amounts can no longer change.");
  });
});
