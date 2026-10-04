'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ConfirmationModal } from '@/components/modals/global-modals/confirmation-modal/confirmation-modal';
import { ExamplePrompts } from '@/components/assistants/example-prompts';
import { KeyCreateForm } from '@/components/assistants/key-create-form';
import { KeyList } from '@/components/assistants/key-list';
import { KeyReveal } from '@/components/assistants/key-reveal';
import { SetupSteps } from '@/components/assistants/setup-steps';
import { revokePersonalKey } from '@/lib/actions/personal-key-actions';
import { redirectIfUnauthorized } from '@/lib/helpers/client-session-redirect';
import type {
  PersonalKeyList,
  PersonalKeySummary,
} from '@/types/personal-key/types';

interface AssistantKeysProps {
  origin: string;
  timeZone: string;
  keys: PersonalKeyList;
}

type Reveal = { id: string; name: string; fullKey: string };

/**
 * Owns the key lists and the one-time reveal. The full key lives only in this component's
 * memory: it is never sent back by the server after create and is gone on reload (AC-02).
 */
export function AssistantKeys({ origin, timeZone, keys }: AssistantKeysProps) {
  const router = useRouter();
  const [list, setList] = useState(keys);
  const [seenKeys, setSeenKeys] = useState(keys);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<PersonalKeySummary | null>(
    null
  );

  // The dialog keeps the last target's name while it animates closed.
  const [lastTarget, setLastTarget] = useState<PersonalKeySummary | null>(null);
  if (revokeTarget && revokeTarget !== lastTarget) setLastTarget(revokeTarget);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [focusHeading, setFocusHeading] = useState(false);

  // The revoked row's Revoke button is gone, so focus would fall to <body>; park it on the list heading.
  useEffect(() => {
    if (!focusHeading || revokeTarget) return;
    const id = setTimeout(() => {
      headingRef.current?.focus();
      setFocusHeading(false);
    }, 0);
    return () => clearTimeout(id);
  }, [focusHeading, revokeTarget]);

  // A fresh server render (after a create/revoke refresh) replaces the local copy.
  if (keys !== seenKeys) {
    setSeenKeys(keys);
    setList(keys);
  }

  function handleCreated(key: PersonalKeySummary, fullKey: string) {
    setReveal({ id: key.id, name: key.name, fullKey });
    setList((prev) => ({ ...prev, active: [key, ...prev.active] }));
    router.refresh();
  }

  async function handleConfirmRevoke() {
    const target = revokeTarget;
    if (!target) return;
    const result = await revokePersonalKey(target.id);
    setRevokeTarget(null);
    if (redirectIfUnauthorized(result)) return;

    if (result.success) {
      const revokedAt = new Date().toISOString();
      setList((prev) => ({
        active: prev.active.filter((k) => k.id !== target.id),
        revoked: [{ ...target, revokedAt }, ...prev.revoked],
      }));
      setReveal((r) => (r?.id === target.id ? null : r));
      setLimitMessage(null);
      setFocusHeading(true);
      toast.success('Key revoked.');
      router.refresh();
    } else if (result.code === 'NOT_FOUND') {
      toast.error('Key not found.');
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <KeyCreateForm
          onCreated={handleCreated}
          limitMessage={limitMessage}
          onLimit={setLimitMessage}
        />
        {reveal && <KeyReveal name={reveal.name} fullKey={reveal.fullKey} />}
      </div>
      <SetupSteps origin={origin} fullKey={reveal?.fullKey} />
      <ExamplePrompts />
      <KeyList
        active={list.active}
        revoked={list.revoked}
        timeZone={timeZone}
        onRevoke={setRevokeTarget}
        headingRef={headingRef}
      />
      <ConfirmationModal
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleConfirmRevoke}
        title={`Revoke "${(revokeTarget ?? lastTarget)?.name ?? ''}"?`}
        description="Any assistant using this key stops working right away. This can't be undone: you'll need a new key to reconnect."
        confirmText="Revoke key"
        variant="destructive"
      />
    </>
  );
}
