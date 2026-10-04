'use client';

import type { Ref } from 'react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from '@/components/ui/empty';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
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
  /** Stable focus target once a revoked row has left the list. */
  headingRef?: Ref<HTMLHeadingElement>;
}

// Explicit zone so the server pass and the browser agree.
function formatDate(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone,
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
  headingRef,
}: KeyListProps) {
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
          <ItemGroup className="gap-2">
            {active.map((key) => (
              <Item key={key.id} variant="outline" className="flex-col items-stretch sm:flex-row sm:items-center">
                <ItemContent>
                  <ItemTitle>{key.name}</ItemTitle>
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
                </ItemContent>
                <ItemActions className="w-full sm:w-auto">
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
