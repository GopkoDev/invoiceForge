'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { CopyButton } from '@/components/ui/copy-button';

interface KeyRevealProps {
  name: string;
  fullKey: string;
}

export function KeyReveal({ name, fullKey }: KeyRevealProps) {
  return (
    <Alert>
      <AlertTitle>{`Your new key "${name}"`}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>Copy it now. You won&apos;t be able to see it again.</p>
        <InputGroup>
          <InputGroupInput
            readOnly
            value={fullKey}
            aria-label="New key"
            className="font-mono text-xs"
          />
          <InputGroupAddon align="inline-end">
            <CopyButton value={fullKey} what="key" />
          </InputGroupAddon>
        </InputGroup>
      </AlertDescription>
    </Alert>
  );
}
