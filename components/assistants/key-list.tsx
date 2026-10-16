'use client';

import { useState, type Ref } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import { formatMoment } from '@/lib/format';
import { MAX_ACTIVE_PERSONAL_KEYS } from '@/lib/validations/personal-key';
import type {
  PersonalKeySummary,
  RevokedPersonalKeySummary,
} from '@/types/personal-key/types';

interface KeyListProps {
  active: PersonalKeySummary[];
  revoked: RevokedPersonalKeySummary[];
  timeZone: string;
  onRevoke: (key: PersonalKeySummary) => void;
  onLift: (key: PersonalKeySummary) => Promise<void>;
  /** Stable focus target once a revoked row has left the list. */
  headingRef?: Ref<HTMLHeadingElement>;
}

// Explicit zone so the server pass and the browser agree.
function formatDate(iso: string, timeZone: string): string {
  return formatMoment(iso, timeZone);
}

function formatDateTime(iso: string, timeZone: string): string {
  return formatMoment(iso, timeZone, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function KeyList({
  active,
  revoked,
  timeZone,
  onRevoke,
  onLift,
  headingRef,
}: KeyListProps) {
  const [lifting, setLifting] = useState<string | null>(null);
  const hasReadOnly = active.some((k) => !k.canCreateDrafts);

  async function handleLift(key: PersonalKeySummary) {
    if (lifting) return;
    setLifting(key.id);
    try {
      await onLift(key);
    } finally {
      setLifting(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          {`Active keys (${active.length} of ${MAX_ACTIVE_PERSONAL_KEYS})`}
        </h2>
        {active.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyDescription>
                No keys yet. Create one above to connect your first assistant.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {hasReadOnly && (
              <Alert>
                <AlertDescription>
                  Read-only keys can&apos;t be given Draft permission. To let an
                  assistant create drafts, create a new key with Draft
                  permission, then revoke the old one.
                </AlertDescription>
              </Alert>
            )}
            <ItemGroup className="gap-2">
              {active.map((key) => (
                <Item
                  key={key.id}
                  variant="outline"
                  className="flex-col items-stretch sm:flex-row sm:items-center"
                >
                  <ItemContent>
                    <ItemTitle>
                      {key.name}
                      <Badge
                        variant={key.canCreateDrafts ? 'default' : 'secondary'}
                      >
                        {key.canCreateDrafts
                          ? 'Can create drafts'
                          : 'Read-only'}
                      </Badge>
                    </ItemTitle>
                    <ItemDescription>
                      {`Created ${formatDate(key.createdAt, timeZone)}`}
                    </ItemDescription>
                    <ItemDescription>
                      <span className="font-mono">{`••••${key.lastFour}`}</span>
                    </ItemDescription>
                    <ItemDescription>
                      {key.lastUsedAt
                        ? `Last used ${formatDateTime(key.lastUsedAt, timeZone)}`
                        : 'Never used'}
                    </ItemDescription>
                    {key.draftsToday && (
                      <ItemDescription>
                        {`Drafts today: ${key.draftsToday.created} of ${key.draftsToday.allowance}${
                          key.draftsToday.created >= key.draftsToday.allowance
                            ? ' · limit reached'
                            : ''
                        }`}
                      </ItemDescription>
                    )}
                    {key.draftsToday?.lastLiftedAt && (
                      <ItemDescription>
                        {`Limit last lifted ${formatDateTime(key.draftsToday.lastLiftedAt, timeZone)}`}
                      </ItemDescription>
                    )}
                  </ItemContent>
                  <ItemActions className="w-full sm:w-auto">
                    {key.draftsToday &&
                      key.draftsToday.created >= key.draftsToday.allowance && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full sm:w-auto"
                          disabled={lifting === key.id}
                          onClick={() => handleLift(key)}
                        >
                          {lifting === key.id && <Spinner />}
                          Lift limit
                        </Button>
                      )}
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      aria-label={`Revoke ${key.name}`}
                      onClick={() => onRevoke(key)}
                    >
                      Revoke
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </>
        )}
      </section>

      {revoked.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Revoked keys</h2>
          <ItemGroup className="gap-2">
            {revoked.map((key) => (
              <Item key={key.id} variant="muted">
                <ItemContent>
                  <ItemTitle>{key.name}</ItemTitle>
                  <ItemDescription>
                    <span className="font-mono">{`••••${key.lastFour}`}</span>
                  </ItemDescription>
                  <ItemDescription>
                    {`Revoked ${formatDate(key.revokedAt, timeZone)}`}
                  </ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        </section>
      )}
    </div>
  );
}
