'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

const COPIED_MS = 2000;

interface CopyButtonProps {
  /** Text written to the clipboard. Never logged or sent anywhere. */
  value: string;
  /** What is being copied; used in the label, "Copy {what}". */
  what: string;
}

export function CopyButton({ value, what }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function handleClick() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unavailable');
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it by hand.");
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={copied ? 'Copied' : `Copy ${what}`}
        onClick={handleClick}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? 'Copied' : ''}
      </span>
    </>
  );
}
