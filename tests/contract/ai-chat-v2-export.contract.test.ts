// ai-chat-v2 T27 (contracts/server-actions.md §Data export; spec.md §5 AC-34): the export contract is version 2.3 —
// startedFrom on each Conversation, origin and offer on each message, offers with labels only (no record references,
// no stored draft request). Validated against the living UserDataExport schema (security-patch openapi.yaml).
import { describe, expect, it } from 'vitest';
import {
  assertMatchesContract,
  SECURITY_PATCH_SPEC_PATH,
} from '../support/contract/validate';

const OFFER = {
  kind: 'CUSTOMER',
  options: [
    { optionId: 1, label: 'Acme Corp (billing@acme.example.test)' },
    { optionId: 2, label: 'Acme GmbH (no email)' },
  ],
  state: 'CHOSEN',
  chosenOptionId: 1,
  createdAt: '2026-10-02T10:00:00.000Z',
};

function body(patch: (b: ReturnType<typeof base>) => void = () => {}) {
  const b = base();
  patch(b);
  return b;
}

function base() {
  return {
    exportDate: '2026-10-02T10:00:00.000Z',
    exportVersion: '2.3' as string,
    user: { id: 'u1', email: 'user-1@example.test' },
    accounts: [],
    emailHistory: [],
    senderProfiles: [],
    customers: [],
    products: [],
    invoices: [{ id: 'inv1', issuedFromChat: true }],
    personalKeys: [],
    conversations: [
      {
        title: 'Acme invoice',
        createdAt: '2026-10-02T10:00:00.000Z',
        lastMessageAt: '2026-10-02T10:00:00.000Z',
        startedFrom: 'DASHBOARD_PROMPT' as unknown,
        messages: [
          {
            role: 'user',
            createdAt: '2026-10-02T10:00:00.000Z',
            text: 'Invoice Acme',
            links: [],
            draftCardIds: [],
            origin: 'DASHBOARD' as unknown,
            offer: null as unknown,
          },
          {
            role: 'assistant',
            createdAt: '2026-10-02T10:00:01.000Z',
            text: 'Which one?',
            links: [],
            draftCardIds: [],
            origin: null as unknown,
            offer: OFFER as unknown,
          },
        ] as Record<string, unknown>[],
        draftCards: [],
      } as Record<string, unknown>,
    ],
    messageAllowanceDays: [],
  };
}

const check = (b: unknown) =>
  assertMatchesContract({
    operationId: 'exportUserData',
    status: 200,
    body: b,
    specPath: SECURITY_PATCH_SPEC_PATH,
  });

describe('data export 2.3 contract (ai-chat-v2 T27, AC-34)', () => {
  it('a 2.3 body with start point, origins and an offer matches', async () => {
    await expect(check(body())).resolves.toBeUndefined();
  });

  it('every start point and origin value is accepted', async () => {
    for (const startedFrom of [
      'AI_SECTION',
      'INVOICE_LIST',
      'DASHBOARD_PROMPT',
      'DASHBOARD_CREATE',
    ]) {
      await expect(
        check(body((b) => (b.conversations[0].startedFrom = startedFrom)))
      ).resolves.toBeUndefined();
    }
    for (const origin of ['TYPED', 'PRESSED', 'DASHBOARD', null]) {
      await expect(
        check(
          body(
            (b) =>
              ((
                b.conversations[0].messages as Record<string, unknown>[]
              )[0].origin = origin)
          )
        )
      ).resolves.toBeUndefined();
    }
  });

  it('the old 2.2 version is refused', async () => {
    await expect(check(body((b) => (b.exportVersion = '2.2')))).rejects.toThrow(
      /does not match/
    );
  });

  it('a Conversation without startedFrom, or a message without origin or offer, is refused', async () => {
    await expect(
      check(body((b) => delete b.conversations[0].startedFrom))
    ).rejects.toThrow();
    await expect(
      check(
        body(
          (b) =>
            delete (b.conversations[0].messages as Record<string, unknown>[])[0]
              .origin
        )
      )
    ).rejects.toThrow();
    await expect(
      check(
        body(
          (b) =>
            delete (b.conversations[0].messages as Record<string, unknown>[])[1]
              .offer
        )
      )
    ).rejects.toThrow();
  });

  it('an offer never carries its stored request, and an option never carries its record reference', async () => {
    await expect(
      check(
        body(
          (b) =>
            ((
              b.conversations[0].messages as Record<string, unknown>[]
            )[1].offer = { ...OFFER, request: { customer: 'Acme' } })
        )
      )
    ).rejects.toThrow();
    await expect(
      check(
        body(
          (b) =>
            ((
              b.conversations[0].messages as Record<string, unknown>[]
            )[1].offer = {
              ...OFFER,
              options: [
                { optionId: 1, label: 'Acme Corp', ref: { customerId: 'c1' } },
              ],
            })
        )
      )
    ).rejects.toThrow();
  });

  it('an unknown offer state or kind is refused', async () => {
    await expect(
      check(
        body(
          (b) =>
            ((
              b.conversations[0].messages as Record<string, unknown>[]
            )[1].offer = { ...OFFER, state: 'PENDING' })
        )
      )
    ).rejects.toThrow();
    await expect(
      check(
        body(
          (b) =>
            ((
              b.conversations[0].messages as Record<string, unknown>[]
            )[1].offer = { ...OFFER, kind: 'TAX' })
        )
      )
    ).rejects.toThrow();
  });
});
