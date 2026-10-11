// T07 (ai-assistant; spec.md §1 "Currency symbols", §5 AC-19) - "$" is USD, "€" EUR, "£" GBP;
// "$" is ambiguous when the default bank account is in another dollar currency (CAD, AUD).
import { describe, expect, it } from 'vitest';

import { interpretCurrency } from '@/lib/services/assistant-drafts/currency-symbols';

describe('interpretCurrency(written, defaultCurrency)', () => {
  it.each([
    ['$', 'USD', 'USD'],
    ['$', 'EUR', 'USD'],
    ['€', 'USD', 'EUR'],
    ['£', 'USD', 'GBP'],
    ['EUR', 'USD', 'EUR'],
    ['eur', 'USD', 'EUR'],
    [' pln ', 'USD', 'PLN'],
  ])('%s with default %s means %s', (written, def, expected) => {
    expect(interpretCurrency(written, def)).toEqual({ kind: 'RESOLVED', currency: expected });
  });

  it.each(['CAD', 'AUD'])('"$" with a %s default account is unclear and never picked', (def) => {
    const r = interpretCurrency('$', def);
    expect(r.kind).toBe('UNCLEAR');
    if (r.kind !== 'UNCLEAR') return;
    expect(r.options).toEqual(expect.arrayContaining(['USD', def]));
  });

  it('an explicit code stays resolved even with a CAD default account', () => {
    expect(interpretCurrency('USD', 'CAD')).toEqual({ kind: 'RESOLVED', currency: 'USD' });
  });

  it('a word that is no known currency is unclear, not guessed', () => {
    expect(interpretCurrency('bucks', 'USD').kind).toBe('UNCLEAR');
  });
});
