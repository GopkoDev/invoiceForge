'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { createPersonalKey } from '@/lib/actions/personal-key-actions';
import { redirectIfUnauthorized } from '@/lib/helpers/client-session-redirect';
import {
  KEY_NAME_MESSAGE,
  personalKeyNameSchema,
} from '@/lib/validations/personal-key';
import type { PersonalKeySummary } from '@/types/personal-key/types';

interface KeyCreateFormProps {
  onCreated: (key: PersonalKeySummary, fullKey: string) => void;
  /** Message of a limit refusal, owned by the parent so a revoke can clear it. */
  limitMessage: string | null;
  onLimit: (message: string | null) => void;
}

export function KeyCreateForm({
  onCreated,
  limitMessage,
  onLimit,
}: KeyCreateFormProps) {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (creating) return;
    onLimit(null);
    setNameError(null);

    if (!personalKeyNameSchema.safeParse(name).success) {
      setNameError(KEY_NAME_MESSAGE);
      return;
    }

    setCreating(true);
    try {
      const result = await createPersonalKey({ name });
      if (redirectIfUnauthorized(result)) return;
      if (result.success) {
        onCreated(result.data.key, result.data.fullKey);
        setName('');
        return;
      }
      if (result.code === 'VALIDATION') {
        setNameError(result.fieldErrors?.name?.[0] ?? KEY_NAME_MESSAGE);
      } else if (result.code === 'CONFLICT') {
        onLimit(result.error);
      } else {
        toast.error('Could not create the key. Try again.');
      }
    } catch {
      // A rejected call is the proxy's 401 as a client sees it.
      redirectIfUnauthorized({ success: false, code: 'UNAUTHORIZED' });
    } finally {
      setCreating(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      {limitMessage && (
        <Alert variant="destructive">
          <AlertDescription>{limitMessage}</AlertDescription>
        </Alert>
      )}
      <Field data-invalid={nameError ? true : undefined}>
        <FieldLabel htmlFor="personal-key-name">Key name</FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="personal-key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={creating}
            aria-invalid={nameError ? true : undefined}
            placeholder="e.g. Laptop assistant"
            autoComplete="off"
          />
          <Button type="submit" disabled={creating}>
            {creating && <Spinner />}
            Create key
          </Button>
        </div>
        {nameError ? (
          <FieldError>{nameError}</FieldError>
        ) : (
          <FieldDescription>
            1 to 50 characters, e.g. the device or assistant it&apos;s for.
          </FieldDescription>
        )}
      </Field>
    </form>
  );
}
