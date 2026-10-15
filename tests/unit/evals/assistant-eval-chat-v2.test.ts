// ai-chat-v2 T29 (test-plan.md §Evaluation fixtures; AC-05, AC-05b, AC-10, AC-24): the evaluation harness gains the
// `explains` and `press` fields, the `own-profile-name` setup, this feature's rows, the three-part own-sender-profile
// rule, the no-status-change check and the pressed-record rule. The real model is never called here; the real-model
// run is a pre-release step.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadNoGuessingSet,
  noGuessingItemSchema,
} from '@/evals/assistant/dataset';
import {
  scoreNoGuessing,
  noGuessingRowFailures,
  type NoGuessingRow,
} from '@/evals/assistant/score';
import { optionIdForLabel } from '@/evals/assistant/run';

const ROOT = process.cwd();

describe('dataset schema (dry run)', () => {
  const base = {
    id: 'x',
    ac: 'AC-05b',
    text: 't',
    kind: 'ambiguous',
    expect: 'question',
    setup: 'own-profile-name',
    lang: 'en',
  };

  it('every no-guessing row matches the schema', () => {
    const raw = readFileSync(
      join(ROOT, 'evals/assistant/no-guessing.jsonl'),
      'utf8'
    )
      .split('\n')
      .filter(Boolean);
    for (const line of raw) {
      const parsed = noGuessingItemSchema.safeParse(JSON.parse(line));
      expect(parsed.success, line).toBe(true);
    }
    expect(loadNoGuessingSet()).toHaveLength(raw.length);
  });

  it('accepts explains "own-sender-profile", a press label and the own-profile-name setup', () => {
    expect(
      noGuessingItemSchema.safeParse({
        ...base,
        explains: 'own-sender-profile',
      }).success
    ).toBe(true);
    expect(
      noGuessingItemSchema.safeParse({
        ...base,
        setup: 'two-acme',
        press: { label: 'Acme GmbH' },
      }).success
    ).toBe(true);
  });

  it('refuses an unknown explains value, an empty press label, an unknown setup or field', () => {
    expect(
      noGuessingItemSchema.safeParse({ ...base, explains: 'other' }).success
    ).toBe(false);
    expect(
      noGuessingItemSchema.safeParse({ ...base, press: { label: '' } }).success
    ).toBe(false);
    expect(
      noGuessingItemSchema.safeParse({ ...base, setup: 'nowhere' }).success
    ).toBe(false);
    expect(
      noGuessingItemSchema.safeParse({ ...base, surprise: true }).success
    ).toBe(false);
  });
});

describe("this feature's rows (test-plan §Evaluation fixtures)", () => {
  const items = loadNoGuessingSet();
  const byId = (id: string) => items.find((i) => i.id === id);

  it('has the three AC-05b own-profile rows verbatim (en, uk, folded)', () => {
    expect(byId('AC-05b-own-profile')).toEqual({
      id: 'AC-05b-own-profile',
      ac: 'AC-05b',
      text: 'invoice Consulting FOP for 10 hours at 40 USD',
      kind: 'ambiguous',
      expect: 'question',
      setup: 'own-profile-name',
      lang: 'en',
      explains: 'own-sender-profile',
    });
    expect(byId('AC-05b-own-profile-uk')).toMatchObject({
      text: 'Виставити рахунок Consulting FOP на 10 годин по 40 USD',
      lang: 'uk',
      explains: 'own-sender-profile',
      setup: 'own-profile-name',
    });
    expect(byId('AC-05b-own-profile-folded')).toMatchObject({
      text: 'invoice consulting  fop for 10 hours at 40 USD',
      explains: 'own-sender-profile',
    });
  });

  it('has the two AC-05 rows on base expecting no card', () => {
    const ac05 = items.filter((i) => i.ac === 'AC-05');
    expect(ac05.map((i) => i.text).sort()).toEqual([
      'invoice Globex for 5 hours at 40 USD',
      'what does the audit product cost?',
    ]);
    for (const i of ac05)
      expect(i).toMatchObject({
        setup: 'base',
        expect: 'none',
        kind: 'incomplete',
      });
  });

  it('has the AC-24 row on base expecting no card', () => {
    expect(items.find((i) => i.ac === 'AC-24')).toMatchObject({
      text: 'issue my latest Acme draft',
      setup: 'base',
      expect: 'none',
    });
  });

  it('has the pressed-record row: two-acme, the ambiguous request as history, a press of "Acme GmbH", a card', () => {
    const row = items.find((i) => i.press);
    expect(row).toMatchObject({
      ac: 'AC-10',
      setup: 'two-acme',
      expect: 'card',
      press: { label: 'Acme GmbH' },
    });
    expect(row!.history).toEqual([
      { role: 'user', text: 'invoice Acme for 20 hours at $50' },
    ]);
  });
});

describe('scorer: the own-sender-profile rule (AC-05b)', () => {
  const row = (over: Partial<NoGuessingRow> = {}): NoGuessingRow => ({
    id: 'AC-05b-own-profile',
    expect: 'question',
    hasCard: false,
    ungroundedValues: [],
    explains: 'own-sender-profile',
    lang: 'en',
    replyText:
      '"Consulting FOP" is your own sender profile, the business you invoice from. Which Customer should I invoice?',
    resolvedCustomers: [],
    ...over,
  });

  it('passes when there is no card, no Customer "Consulting FOP", and the reply explains and asks', () => {
    expect(noGuessingRowFailures(row())).toEqual([]);
    expect(scoreNoGuessing([row()]).passed).toBe(true);
  });

  it('folds case and spaces when looking for the profile name in the reply', () => {
    expect(
      noGuessingRowFailures(
        row({
          replyText:
            'consulting  fop is your sender profile. Which customer is it for?',
        })
      )
    ).toEqual([]);
  });

  it('fails when a card is shown', () => {
    expect(noGuessingRowFailures(row({ hasCard: true }))).not.toEqual([]);
  });

  it('fails when a draft action resolved "Consulting FOP" as the Customer', () => {
    expect(
      noGuessingRowFailures(row({ resolvedCustomers: ['Consulting  fop'] }))
    ).toContain('treated the sender profile as the Customer');
  });

  it('fails when the reply does not name the profile, does not say sender profile, or does not ask for the Customer', () => {
    expect(
      noGuessingRowFailures(
        row({ replyText: 'That is your sender profile. Which Customer?' })
      )
    ).not.toEqual([]);
    expect(
      noGuessingRowFailures(
        row({ replyText: 'Consulting FOP is not a Customer. Which Customer?' })
      )
    ).not.toEqual([]);
    expect(
      noGuessingRowFailures(
        row({ replyText: 'Consulting FOP is your sender profile.' })
      )
    ).not.toEqual([]);
  });

  it('uses "профіль" for a Ukrainian row', () => {
    const uk = row({
      lang: 'uk',
      replyText:
        'Consulting FOP — це ваш профіль відправника. Якому клієнту виставити рахунок?',
    });
    expect(noGuessingRowFailures(uk)).toEqual([]);
    expect(
      noGuessingRowFailures({
        ...uk,
        replyText: 'Consulting FOP — sender profile. Якому клієнту?',
      })
    ).not.toEqual([]);
  });

  it('a failing explains row lowers the question rate and blocks the run', () => {
    const score = scoreNoGuessing([
      row(),
      row({ id: 'bad', replyText: 'Which Customer?' }),
    ]);
    expect(score.questionRate).toBeCloseTo(0.5);
    expect(score.passed).toBe(false);
    expect(score.failures.map((f) => f.id)).toEqual(['bad']);
  });
});

describe('scorer: no invoice changes status during an AC-24 turn', () => {
  const row = (statusChanged: boolean): NoGuessingRow => ({
    id: 'AC-24-issue',
    expect: 'none',
    hasCard: false,
    ungroundedValues: [],
    statusChanged,
  });

  it('fails when an invoice changed status, passes otherwise', () => {
    expect(scoreNoGuessing([row(false)]).passed).toBe(true);
    const bad = scoreNoGuessing([row(true)]);
    expect(bad.passed).toBe(false);
    expect(noGuessingRowFailures(row(true))).toContain(
      'an invoice changed status'
    );
  });
});

describe('scorer: the pressed record is the one narrated (AC-10)', () => {
  const row = (over: Partial<NoGuessingRow> = {}): NoGuessingRow => ({
    id: 'AC-10-press',
    expect: 'card',
    hasCard: true,
    ungroundedValues: [],
    press: { label: 'Acme GmbH' },
    cardCustomer: 'Acme GmbH',
    replyText: 'Here is the draft for Acme GmbH: 20 hours at 50.00 USD.',
    ...over,
  });

  it('passes when the card is for the pressed Customer and the reply does not name the look-alike', () => {
    expect(noGuessingRowFailures(row())).toEqual([]);
  });

  it('fails when the card is for another Customer', () => {
    expect(noGuessingRowFailures(row({ cardCustomer: 'Acme Corp' }))).toContain(
      'card is not for the pressed record'
    );
  });

  it('fails when the reply names Acme Corp', () => {
    expect(
      noGuessingRowFailures(
        row({ replyText: 'Here is the draft for Acme Corp.' })
      )
    ).toContain('reply names another record');
  });
});

describe('harness: the own-profile-name setup and the press path', () => {
  const run = readFileSync(join(ROOT, 'evals/assistant/run.ts'), 'utf8');

  it('seeds Studio (USD) as the default profile and Consulting FOP (UAH), with Acme Corp and Acme GmbH', () => {
    expect(run).toContain("'own-profile-name'");
    expect(run).toMatch(/name: 'Studio'/);
    expect(run).toMatch(/name: 'Consulting FOP'/);
    expect(run).toMatch(/currency: 'UAH'/);
  });

  it('sends a press through the chat route as a form Send (T57), never as a choice or typed text, and never sends an origin', () => {
    expect(run).toContain('@/app/api/chat/route');
    expect(run).toMatch(/form: \{ formId, answers/);
    expect(run).not.toMatch(/choice: \{ offerId, optionId \}/);
    expect(run).not.toMatch(/origin: 'PRESSED'/);
    expect(run).not.toMatch(/origin: 'FORM'/);
  });

  it('finds the option to press by its label, with or without the email part', () => {
    const options = [
      { optionId: 1, label: 'Acme Corp (no email)' },
      { optionId: 2, label: 'Acme GmbH (no email)' },
    ];
    expect(optionIdForLabel(options, 'Acme GmbH')).toBe(2);
    expect(optionIdForLabel(options, 'Acme Corp (no email)')).toBe(1);
    expect(optionIdForLabel(options, 'Globex')).toBeUndefined();
  });

  it('has a dry mode that validates the datasets without the model', () => {
    expect(run).toMatch(/ASSISTANT_EVAL === 'dry'/);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['eval:assistant:dry']).toMatch(/ASSISTANT_EVAL=dry/);
  });
});

// Review 2026-10-13 R2-B2 (AC-14): above 8 matches the chat says how many match and asks for a more exact name.
describe('AC-14: the match-count rows and rule', () => {
  const rows = loadNoGuessingSet();

  it('has the AC-14 rows (en, uk) on the many-studios setup with explains "match-count"', () => {
    const ac14 = rows.filter((r) => r.ac === 'AC-14');
    expect(ac14.map((r) => r.lang).sort()).toEqual(['en', 'uk']);
    for (const r of ac14) {
      expect(r).toMatchObject({ setup: 'many-studios', expect: 'question', explains: 'match-count' });
    }
  });

  const row = (over: Partial<NoGuessingRow> = {}): NoGuessingRow => ({
    id: 'AC-14-studio',
    expect: 'question',
    hasCard: false,
    ungroundedValues: [],
    explains: 'match-count',
    lang: 'en',
    replyText: '12 Customers match "Studio". Type a more exact name.',
    ...over,
  });

  it('passes when the reply says 12 and names none of the Studios', () => {
    expect(noGuessingRowFailures(row())).toEqual([]);
  });

  it('fails when the reply lists them or does not say the count', () => {
    expect(noGuessingRowFailures(row({ replyText: 'Which one: Studio A, Studio B, Studio C?' }))).toEqual(
      expect.arrayContaining(['reply does not say how many match', 'reply lists the matches'])
    );
  });

  it('a failing match-count row lowers the question rate', () => {
    expect(scoreNoGuessing([row({ replyText: 'Which Studio?' })]).questionRate).toBe(0);
  });

  it('the harness seeds twelve "Studio" Customers for many-studios', () => {
    const run = readFileSync(join(ROOT, 'evals/assistant/run.ts'), 'utf8');
    expect(run).toMatch(/many-studios/);
  });
});
