import { useState } from 'react';

// N-01: the editor stores numbers, but a number can't represent what is mid-typed ("-", "1.",
// "abc"). Binding the input straight to the number rewrote the text on every keystroke ("NaN",
// "1.5" -> 15). The input shows the raw draft for as long as it still parses to the stored value,
// and falls back to the stored value when something else changed it (e.g. picking a product).
export function useNumberDraft(value: number, onChange: (raw: string) => void) {
  const [draft, setDraft] = useState<string | null>(null);

  const draftMatchesValue = draft !== null && Object.is(Number(draft), value);

  return {
    value: draftMatchesValue ? draft : String(value),
    onChange: (raw: string) => {
      setDraft(raw);
      onChange(raw);
    },
  };
}
