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
    exportVersion: '2.4' as string,
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
            form: null as unknown,
          },
          {
            role: 'assistant',
            createdAt: '2026-10-02T10:00:01.000Z',
            text: 'Which one?',
            links: [],
            draftCardIds: [],
            origin: null as unknown,
            offer: OFFER as unknown,
            form: null as unknown,
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

describe('data export 2.4 contract (ai-chat-v2 T27, T61, AC-34)', () => {
  it('a 2.4 body with start point, origins and an offer matches', async () => {
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
    for (const origin of ['TYPED', 'PRESSED', 'FORM', 'DASHBOARD', null]) {
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

  it('the old 2.2 and 2.3 versions are refused', async () => {
    await expect(check(body((b) => (b.exportVersion = '2.2')))).rejects.toThrow(
      /does not match/
    );
    await expect(check(body((b) => (b.exportVersion = '2.3')))).rejects.toThrow(
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

  // ---------- T61 (AC-34, revision 2026-10-13): Question forms and their answers ----------

  const FORM = {
    state: 'CHOSEN',
    questions: [
      {
        questionId: 0,
        field: 'CURRENCY',
        heading: 'Currency',
        prompt: 'Which currency?',
        options: [
          { optionId: 0, label: 'USD' },
          { optionId: 1, label: 'EUR' },
        ],
        input: 'NONE',
        required: true,
        skippable: false,
      },
      {
        questionId: 1,
        field: 'PRICE',
        heading: 'Line 1 · Price',
        prompt: null,
        options: [],
        input: 'AMOUNT',
        required: true,
        skippable: false,
      },
      {
        questionId: 2,
        field: 'NOTES',
        heading: 'Notes',
        prompt: null,
        options: [],
        input: 'TEXT',
        required: false,
        skippable: true,
      },
    ],
    answers: [
      { questionId: 0, optionId: 1, label: 'EUR' },
      { questionId: 1, text: '75.50' },
      { questionId: 2, skipped: true },
    ],
  };

  const withForm = (form: unknown) =>
    body((b) => {
      (b.conversations[0].messages as Record<string, unknown>[])[1].form = form;
    });

  it('a reply carrying a sent form with questions, option labels and answers matches', async () => {
    await expect(check(withForm(FORM))).resolves.toBeUndefined();
    await expect(
      check(withForm({ ...FORM, state: 'OPEN', answers: null }))
    ).resolves.toBeUndefined();
    await expect(
      check(withForm({ ...FORM, state: 'CLOSED', answers: null }))
    ).resolves.toBeUndefined();
  });

  it('a message without the form key is refused', async () => {
    await expect(
      check(
        body(
          (b) =>
            delete (b.conversations[0].messages as Record<string, unknown>[])[1]
              .form
        )
      )
    ).rejects.toThrow();
  });

  it('a form never carries ref, request, customerId or bankAccountId, on the form, a question or an option', async () => {
    const leaks: Array<[string, unknown]> = [
      ['request', { customer: 'Acme' }],
      ['customerId', 'c1'],
      ['bankAccountId', 'b1'],
      ['ref', { customerId: 'c1' }],
    ];
    for (const [key, value] of leaks) {
      await expect(
        check(withForm({ ...FORM, [key]: value }))
      ).rejects.toThrow();
      await expect(
        check(
          withForm({
            ...FORM,
            questions: [{ ...FORM.questions[0], [key]: value }],
          })
        )
      ).rejects.toThrow();
      await expect(
        check(
          withForm({
            ...FORM,
            questions: [
              {
                ...FORM.questions[0],
                options: [{ optionId: 0, label: 'USD', [key]: value }],
              },
            ],
          })
        )
      ).rejects.toThrow();
    }
  });

  it('an unknown form state or answer shape is refused', async () => {
    await expect(
      check(withForm({ ...FORM, state: 'PENDING' }))
    ).rejects.toThrow();
    await expect(
      check(withForm({ ...FORM, answers: [{ questionId: 0, ref: { a: 1 } }] }))
    ).rejects.toThrow();
  });
});
