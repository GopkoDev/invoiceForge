import { useState } from 'react';

// N-01: the editor stores numbers, but a number can't represent what is mid-typed ("-", "1.",
// "abc"). Binding the input straight to the number rewrote the text on every keystroke ("NaN",
// "1.5" -> 15). The input shows the raw draft for as long as it still parses to the stored value,
// and falls back to the stored value when something else changed it (e.g. picking a product).
// R-14: Number(raw) also accepts "0x10" and "1e3" and turns empty input into 0 — a silent rewrite.
// Only a plain decimal parses; anything else is NaN so the schema says "... must be a number.".
// S-08: surrounding whitespace is trimmed first (Number() always did), so " 5" and "5 " parse to 5
// while whitespace-only input trims to "" and stays NaN.
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)$/;

export function parseDecimalDraft(raw: string): number {
  return DECIMAL.test(raw.trim()) ? Number(raw.trim()) : NaN;
}

export function useNumberDraft(value: number, onChange: (raw: string) => void) {
  const [draft, setDraft] = useState<string | null>(null);

  const draftMatchesValue = draft !== null && Object.is(parseDecimalDraft(draft), value);

  return {
    value: draftMatchesValue ? draft : String(value),
    onChange: (raw: string) => {
      setDraft(raw);
      onChange(raw);
    },
  };
}
