// ai-chat-v2 T65 (test-plan.md §Revision 2026-10-13 — evaluation fixtures; AC-37, AC-45..AC-49): the evaluation harness
// gains the `form` and `card-or-form` expectations, a link check (an allowlisted in-app href, no "can't give links"), a
// date check on the card, a created-date filter check and a search-first check, plus the seven owner-feedback rows and
// their four setups. The real model is never called here; the real-model run (>= 4 of 5) is a pre-release step.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NO_GUESSING_SETUPS,
  loadNoGuessingSet,
  noGuessingItemSchema,
} from '@/evals/assistant/dataset';
import {
  noGuessingRowFailures,
  scoreNoGuessing,
  type NoGuessingRow,
} from '@/evals/assistant/score';
import { isInAppPath } from '@/lib/ai/in-app-links';

const ROOT = process.cwd();

describe('dataset: the owner-feedback setups and optional check fields', () => {
  const base = {
    id: 'x',
    ac: 'AC-46',
    text: 't',
    kind: 'incomplete',
    expect: 'form',
    setup: 'four-customers-one-profile',
    lang: 'en',
  };

  it('knows the four new setups', () => {
    for (const s of [
      'four-customers-one-profile',
      'four-customers-one-profile+product-web-development',
      'draft-inv-0042',
      'drafts-january',
    ])
      expect(NO_GUESSING_SETUPS).toContain(s);
  });

  it('accepts expect "form" / "card-or-form" and the check fields, refuses bad values', () => {
    const ok = (over: object) =>
      noGuessingItemSchema.safeParse({ ...base, ...over }).success;
    expect(ok({})).toBe(true);
    expect(ok({ expect: 'card-or-form' })).toBe(true);
    expect(ok({ formFields: ['CUSTOMER', 'PRICE'] })).toBe(true);
    expect(ok({ issueDate: '2026-10-12' })).toBe(true);
    expect(ok({ link: true })).toBe(true);
    expect(ok({ searchFirst: true })).toBe(true);
    expect(ok({ createdRange: { from: '2026-01-01', to: '2026-01-31' } })).toBe(
      true
    );
    expect(ok({ expect: 'maybe' })).toBe(false);
    expect(ok({ issueDate: '12 October' })).toBe(false);
    expect(ok({ createdRange: { from: '2026-01-01' } })).toBe(false);
    expect(ok({ surprise: 1 })).toBe(false);
  });
});

describe("the owner-feedback rows (test-plan §Revision 2026-10-13 — evaluation fixtures)", () => {
  const items = loadNoGuessingSet();
  const byId = (id: string) => items.find((i) => i.id === id);

  it('has form-not-prose-uk: a form with a CUSTOMER and a PRICE question', () => {
    expect(byId('form-not-prose-uk')).toMatchObject({
      ac: 'AC-37',
      text: 'вистав інвойс веб дев 10 годин, але покажи список кастомерів',
      setup: 'four-customers-one-profile',
      expect: 'form',
      lang: 'uk',
      formFields: ['CUSTOMER', 'PRICE'],
    });
  });

  it('has form-not-prose-en', () => {
    expect(byId('form-not-prose-en')).toMatchObject({
      ac: 'AC-46',
      text: 'create an invoice for web dev, 10 hours',
      setup: 'four-customers-one-profile',
      expect: 'form',
      lang: 'en',
    });
  });

  it('has single-profile-not-asked: a card, no form', () => {
    expect(byId('single-profile-not-asked')).toMatchObject({
      ac: 'AC-46',
      text: 'invoice My New Customer for 10 hours at 40 USD',
      setup: 'four-customers-one-profile',
      expect: 'card',
      lang: 'en',
    });
  });

  it('has yesterday-date: a card dated 2026-10-12', () => {
    expect(byId('yesterday-date')).toMatchObject({
      ac: 'AC-45',
      text: 'створи мені інвойс на послуги веб дев для my new customer на 176 годин по 30 USD, вчорашнім числом',
      setup: 'four-customers-one-profile',
      expect: 'card',
      lang: 'uk',
      issueDate: '2026-10-12',
    });
  });

  it('has search-before-add: card or form, searched first', () => {
    expect(byId('search-before-add')).toMatchObject({
      ac: 'AC-47',
      text: 'invoice my new customer for web development, 10 hours',
      setup: 'four-customers-one-profile+product-web-development',
      expect: 'card-or-form',
      lang: 'en',
      searchFirst: true,
    });
  });

  it('has link-to-draft: draft-inv-0042 with the draft created in the history, a link in the reply', () => {
    const row = byId('link-to-draft');
    expect(row).toMatchObject({
      ac: 'AC-48',
      text: 'give me a link to that draft',
      setup: 'draft-inv-0042',
      expect: 'none',
      lang: 'en',
      link: true,
    });
    expect(row!.history?.length).toBeGreaterThan(0);
  });

  it('has last-draft-january: drafts-january, created in January, a link', () => {
    expect(byId('last-draft-january')).toMatchObject({
      ac: 'AC-49',
      text: 'останній створений драфт в січні',
      setup: 'drafts-january',
      expect: 'none',
      lang: 'uk',
      link: true,
      createdRange: { from: '2026-01-01', to: '2026-01-31' },
    });
  });

  it('the harness seeds the four setups', () => {
    const run = readFileSync(join(ROOT, 'evals/assistant/run.ts'), 'utf8');
    for (const s of [
      'four-customers-one-profile',
      'product-web-development',
      'draft-inv-0042',
      'drafts-january',
    ])
      expect(run).toContain(s);
  });
});

const row = (over: Partial<NoGuessingRow> = {}): NoGuessingRow => ({
  id: 'r',
  expect: 'none',
  hasCard: false,
  ungroundedValues: [],
  ...over,
});

describe("scorer: expect 'form' (AC-37, AC-46)", () => {
  const formRow = (over: Partial<NoGuessingRow> = {}) =>
    row({
      id: 'form-not-prose-uk',
      expect: 'form',
      hasForm: true,
      formFields: ['CUSTOMER', 'PRICE'],
      expectFormFields: ['CUSTOMER', 'PRICE'],
      replyText:
        'Ось ваші клієнти:\n- My New Customer\n- TEST 2\n- test\n- Оohn Doe\n\nЗаповніть форму нижче.',
      ...over,
    });

  it('passes with one form holding the expected questions and a reply with no question line', () => {
    expect(noGuessingRowFailures(formRow())).toEqual([]);
    expect(scoreNoGuessing([formRow()]).passed).toBe(true);
  });

  it('fails when no form was stored (a "- " list of questions in prose)', () => {
    const f = noGuessingRowFailures(
      formRow({
        hasForm: false,
        formFields: [],
        replyText: 'I need:\n- Which Customer?\n- What price?',
      })
    );
    expect(f).toContain('no form');
    expect(f).toContain('question in prose');
  });

  it('fails when the form lacks an expected question', () => {
    expect(
      noGuessingRowFailures(formRow({ formFields: ['CUSTOMER'] }))
    ).toContain('form lacks PRICE question');
  });

  it('fails when the reply holds a "?" line or a list item asking for a value, even with a form', () => {
    expect(
      noGuessingRowFailures(formRow({ replyText: 'Which Customer is it for?' }))
    ).toContain('question in prose');
    expect(
      noGuessingRowFailures(
        formRow({ replyText: 'Intro\n- What price per hour?\n- test' })
      )
    ).toContain('question in prose');
  });

  it('fails when a card was shown instead, or the form asks for the sender profile', () => {
    expect(noGuessingRowFailures(formRow({ hasCard: true }))).not.toEqual([]);
    expect(
      noGuessingRowFailures(
        formRow({ formFields: ['CUSTOMER', 'PRICE', 'SENDER_PROFILE'] })
      )
    ).toContain('asked for the sender profile');
  });

  it('does not require a form for a card row', () => {
    expect(
      noGuessingRowFailures(
        row({ expect: 'card', hasCard: true, hasForm: false })
      )
    ).toEqual([]);
  });

  it('a card row fails when it also stored a form', () => {
    expect(
      noGuessingRowFailures(
        row({
          id: 'single-profile-not-asked',
          expect: 'card',
          hasCard: true,
          hasForm: true,
        })
      )
    ).toContain('unexpected form');
  });
});

describe("scorer: expect 'card-or-form' (AC-47)", () => {
  const r = (over: Partial<NoGuessingRow> = {}) =>
    row({
      id: 'search-before-add',
      expect: 'card-or-form',
      searchFirst: true,
      toolCalls: ['list_customers', 'list_products', 'propose_draft'],
      hasCard: true,
      replyText: 'Here is the draft for My New Customer.',
      ...over,
    });

  it('passes with a card, or with a form, but not with neither', () => {
    expect(noGuessingRowFailures(r())).toEqual([]);
    expect(
      noGuessingRowFailures(r({ hasCard: false, hasForm: true }))
    ).toEqual([]);
    expect(
      noGuessingRowFailures(r({ hasCard: false, hasForm: false }))
    ).toContain('no card or form');
  });

  it('fails when the reply came without searching Customers first', () => {
    expect(noGuessingRowFailures(r({ toolCalls: [] }))).toContain(
      'did not search before replying'
    );
    expect(
      noGuessingRowFailures(r({ toolCalls: ['propose_draft'] }))
    ).toContain('did not search before replying');
  });

  it('fails when the reply tells the Freelancer to add a Customer or product', () => {
    expect(
      noGuessingRowFailures(
        r({
          replyText: 'Please [add the Customer](/customers/new) first.',
        })
      )
    ).toContain('told to add a record that exists');
  });

  it('rows without searchFirst are not held to the search check', () => {
    expect(
      noGuessingRowFailures(r({ searchFirst: undefined, toolCalls: [] }))
    ).toEqual([]);
  });
});

describe('scorer: the link check (AC-48, AC-49)', () => {
  const r = (over: Partial<NoGuessingRow> = {}) =>
    row({
      id: 'link-to-draft',
      link: true,
      replyText: 'Here you go: [INV-0042](/invoices/abc123/edit)',
      ...over,
    });

  it('the allowlist the check relies on is the app one', () => {
    expect(isInAppPath('/invoices/abc123/edit')).toBe(true);
    expect(isInAppPath('https://evil.example.test/x')).toBe(false);
  });

  it('passes with an allowlisted in-app Markdown link', () => {
    expect(noGuessingRowFailures(r())).toEqual([]);
  });

  it('fails with no link, a link outside the allowlist, or a bare path', () => {
    expect(noGuessingRowFailures(r({ replyText: 'It is INV-0042.' }))).toContain(
      'no in-app link'
    );
    expect(
      noGuessingRowFailures(
        r({ replyText: '[INV-0042](https://app.example.test/invoices/abc123/edit)' })
      )
    ).toContain('no in-app link');
    expect(
      noGuessingRowFailures(r({ replyText: '[INV-0042](/invoices/abc123/edit?x=1)' }))
    ).toContain('no in-app link');
    expect(
      noGuessingRowFailures(r({ replyText: 'Open /invoices/abc123/edit' }))
    ).toContain('no in-app link');
  });

  it('fails when the link is not to the expected record', () => {
    expect(
      noGuessingRowFailures(
        r({ expectedLinkPath: '/invoices/zzz999/edit' })
      )
    ).toContain('link is not to the expected record');
    expect(
      noGuessingRowFailures(
        r({
          expectedLinkPath: '/invoices/abc123/edit',
        })
      )
    ).toEqual([]);
  });

  it('fails when the reply says it cannot give links, in either language', () => {
    expect(
      noGuessingRowFailures(
        r({
          replyText:
            "I can't give links to invoices. [INV-0042](/invoices/abc123/edit)",
        })
      )
    ).toContain('says it cannot give links');
    expect(
      noGuessingRowFailures(
        r({ replyText: 'Я не можу надати посилання на рахунок.' })
      )
    ).toContain('says it cannot give links');
  });

  it('rows without link are not held to it', () => {
    expect(
      noGuessingRowFailures(r({ link: undefined, replyText: 'Done.' }))
    ).toEqual([]);
  });
});

describe('scorer: the date check on the card (AC-45)', () => {
  const r = (over: Partial<NoGuessingRow> = {}) =>
    row({
      id: 'yesterday-date',
      expect: 'card',
      hasCard: true,
      expectIssueDate: '2026-10-12',
      cardIssueDate: '2026-10-12',
      replyText: 'Ось чернетка.',
      ...over,
    });

  it('passes when the card is dated yesterday (today 2026-10-13)', () => {
    expect(noGuessingRowFailures(r())).toEqual([]);
  });

  it("fails with today's date, a missing date, or another day", () => {
    for (const cardIssueDate of ['2026-10-13', null, '2026-10-11']) {
      expect(noGuessingRowFailures(r({ cardIssueDate }))).toContain(
        'issue date is not 2026-10-12'
      );
    }
  });

  it('fails when the reply asks which date "yesterday" is', () => {
    expect(
      noGuessingRowFailures(
        r({ replyText: 'Яка дата означає «вчора»? Вкажіть дату.' })
      )
    ).toContain('asked about the date');
    expect(
      noGuessingRowFailures(
        r({ replyText: 'Which date do you mean by yesterday?' })
      )
    ).toContain('asked about the date');
  });
});

describe('scorer: created-date search (AC-49, "created in January")', () => {
  const r = (over: Partial<NoGuessingRow> = {}) =>
    row({
      id: 'last-draft-january',
      link: true,
      expectCreatedRange: { from: '2026-01-01', to: '2026-01-31' },
      searchInvoicesArgs: [
        {
          status: ['draft'],
          createdFrom: '2026-01-01',
          createdTo: '2026-01-31',
          sort: 'createdAt',
        },
      ],
      replyText: 'Ось він: [INV-0003](/invoices/jan28/edit)',
      ...over,
    });

  it('passes when search_invoices filtered by createdFrom and createdTo', () => {
    expect(noGuessingRowFailures(r())).toEqual([]);
  });

  it('fails when the search used the issue-date filters, no filter, or no search', () => {
    for (const searchInvoicesArgs of [
      [{ issuedFrom: '2026-01-01', issuedTo: '2026-01-31' }],
      [{ status: ['draft'] }],
      [],
      [{ createdFrom: '2026-01-01', createdTo: '2026-02-28' }],
    ]) {
      expect(noGuessingRowFailures(r({ searchInvoicesArgs }))).toContain(
        'search did not filter by the created date'
      );
    }
  });

  it('fails when the reply says none exists', () => {
    const f = noGuessingRowFailures(
      r({
        replyText:
          'You have no drafts created in January. See [INV-0003](/invoices/jan28/edit)',
      })
    );
    expect(f).toContain('says no such invoice exists');
  });
});

describe('scorer: the whole set', () => {
  it('a failing owner-feedback row blocks the run and is named', () => {
    const good = row({
      id: 'link-to-draft',
      link: true,
      replyText: '[INV-0042](/invoices/abc123/edit)',
    });
    const bad = row({ id: 'bad', link: true, replyText: 'no link here' });
    const score = scoreNoGuessing([good, bad]);
    expect(score.passed).toBe(false);
    expect(score.failures.map((f) => f.id)).toEqual(['bad']);
  });

  it('a failing form row lowers the question rate only for question rows (form rows are their own check)', () => {
    const score = scoreNoGuessing([
      row({ id: 'f', expect: 'form', hasForm: false }),
    ]);
    expect(score.passed).toBe(false);
  });
});
