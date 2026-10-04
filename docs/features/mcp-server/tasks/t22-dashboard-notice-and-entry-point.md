---
id: T22
title: "Show the overdue-rule notice and the Connect your AI entry point on the dashboard"
layer: "ui"
deps: ["T01", "T09", "T20"]
blocks: []
acs: ["AC-01", "AC-24"]
files_hint: ["lib/services/profile/overdue-notice.ts", "lib/actions/dashboard-actions.ts", "app/(protected)/dashboard/page.tsx", "components/dashboard/overdue-rule-notice.tsx", "components/dashboard/connect-ai-entry.tsx", "tests/component/dashboard-banners.test.tsx", "tests/integration/actions/overdue-notice.test.ts"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T22 — Show the overdue-rule notice and the Connect your AI entry point on the dashboard

## Place in the sequence

- **Blocked by:** T01 — Promote the five staged migrations and extend the test support for keys, usage and time zone · T09 — Create, list and revoke Personal keys through the business layer and server actions · T20 — Add the Connect your AI settings page with setup steps, example prompts and a CopyButton · **Blocks:** — · **Wave:** 3 — needs the notice column, `hasUsedAnyPersonalKey` and the page the entry point links to.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** to create a named Personal key from a visible "Connect your AI" entry point and get ready-to-paste setup and example prompts for my assistant
> **So that** my assistant can answer questions about my invoices without me opening the app
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** the dashboard and invoice list to treat a past-due unpaid invoice as overdue without my marking it
> **So that** my dashboard and my Assistant agree on who owes me
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task adds the two SCR-01 banners: the dashboard entry point (AC-01) and the one-time notice explaining the new overdue rule (spec §8 default, tied to AC-24).

## Inlined context

> | default + entry point | `hasUsedAnyPersonalKey` → `false` (AC-01; flow 3 `alt`). Gone for good once any key has passed a key check, even if every key is later revoked | `Alert`, `buttonVariants` link → SCR-03 |
> | default + overdue-rule notice | `getDashboardNoticeState` → `showOverdueRuleNotice: true` | `Alert`, `Button` ("Got it") |
> | notice dismissed | "Got it" → `dismissOverdueRuleNotice` → `ok()`. The notice disappears and never returns, on any device | — |
> | notice dismiss failed | `dismissOverdueRuleNotice` → `FAILED`: `toast.error` with the result's `error`, and the notice stays. `UNAUTHORIZED` → sign-in | `Sonner` |
> | error | A section, the entry-point read or the notice-state read fails → `unwrapPageResult` → existing `(protected)/error.tsx` (`LoadError`) | `LoadError` |
>
> Order below the header: `DashboardSetupAlert` (when setup is incomplete) → overdue-rule notice → Connect your AI entry point → sections.
>
> Notice copy: "Overdue is now automatic" / "Pending invoices past their due date now count as overdue on their own: here, in your invoice list and in your AI assistant's answers. The invoice itself doesn't change, and you can still mark it paid." [Got it]. Entry copy: "Connect your AI" / "Ask Claude or Cursor who owes you money and what's coming in, straight from your invoiceFlow data." / "Read-only." [Connect your AI ->]. Phone: the two banners stack full-width; buttons go below the text.
>
> — `screens.md §SCR-01, states + wireframe, abridged` · full text: [screens.md](../screens.md)

> W->>S: has any of this Freelancer's keys ever passed a key check? → S->>D: look for any key, active or revoked, with a last use → alt no key ever used → show the entry point; else a key was used at least once → hide the entry point for good, even if every key is revoked
>
> — `sad.md §6, Flow 3, abridged` · full text: [sad.md](../sad.md)

> - `getDashboardNoticeState(): ActionResult<{ showOverdueRuleNotice: boolean }>` — true while `User.overdueNoticeDismissedAt` is NULL.
> - `dismissOverdueRuleNotice(): ActionResult<void>` ★ — `updateMany` by id where it is still NULL; repeat calls return `ok()`.
> - `hasUsedAnyPersonalKey(actor): Promise<ActionResult<boolean>>` — AC-01: true once any key, active or revoked, has `lastUsedAt`. The dashboard shows the Connect your AI entry point while it is false; Settings always shows it.
>
> — `contracts/server-actions.md §Overdue-rule notice + §Read functions, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[screens.md](../screens.md) · [server-actions.md](../contracts/server-actions.md)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `User.overdueNoticeDismissedAt` | TIMESTAMP(3) | NULL | read + conditional write (`updateMany … WHERE overdueNoticeDismissedAt IS NULL`) |
| `PersonalKey.lastUsedAt` | TIMESTAMP(3) | NULL | read-only (`EXISTS … WHERE userId = $1 AND lastUsedAt IS NOT NULL`, via T09) |

> Notice: shown when `overdueNoticeDismissedAt IS NULL`. Dismiss: `updateMany` by id where it is still NULL.
>
> — `data-model.md §Entities, User + PersonalKey access patterns, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `getDashboardNoticeState()` → `ok({ showOverdueRuleNotice })` · `dismissOverdueRuleNotice()` → `ok()` (idempotent) · `FAILED` / `UNAUTHORIZED` per repo convention (in `lib/actions/dashboard-actions.ts`).
- `hasUsedAnyPersonalKey(actor)` → `ok(boolean)` (built in T09; read here).

— `contracts/server-actions.md §Overdue-rule notice, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-01 — happy path

> **Given** a signed-in Freelancer with no Personal keys
> **When** they open the dashboard or the settings
> **Then** they see a "Connect your AI" entry point that leads to the connect page. On the dashboard it stays visible until any of their keys has been used at least once, and it does not come back after that, even if every key is later revoked. A key counts as used when any call presented with it passes the key check
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

### AC-24 — cross-context

> **Given** a pending invoice whose due date has passed and that the Freelancer never marked overdue
> **When** they open the dashboard and the invoice list
> **Then** the dashboard counts it in the overdue figures, lists its Customer as a Debtor and leaves it out of Expected payments. The invoice list shows it as overdue, includes it when filtered by overdue and leaves it out when filtered by pending, matching what an Assistant reports. Every other place that shows an invoice's status shows it as overdue too, including the dashboard's recent invoices, the customer page and the invoice itself. "Mark as overdue" and "back to pending" are not offered for it. Its stored status is unchanged, and marking it paid works as before
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

(This task covers the notice that announces the AC-24 rule change; the figures and statuses are T06–T08.)

## Checklist

- [ ] `lib/services/profile/overdue-notice.ts` — `getOverdueNoticeState(actor)`, `dismissOverdueNotice(actor)` (conditional `updateMany`).
- [ ] `lib/actions/dashboard-actions.ts` — `getDashboardNoticeState`, `dismissOverdueRuleNotice` (session guard first).
- [ ] `components/dashboard/overdue-rule-notice.tsx` — `Alert` + "Got it" `Button`, toast on `FAILED`, sign-in on `UNAUTHORIZED`.
- [ ] `components/dashboard/connect-ai-entry.tsx` — `Alert` + `buttonVariants` link to `protectedRoutes.settingsAssistants`.
- [ ] `app/(protected)/dashboard/page.tsx` — read both states via `unwrapPageResult`, render in the SCR-01 order.
- [ ] Tests: `tests/integration/actions/overdue-notice.test.ts`, `tests/component/dashboard-banners.test.tsx`.

## Edge cases

| Case | Behaviour |
|---|---|
| Dismiss twice / on two devices | second call `ok()`, no write; notice gone everywhere |
| Every key revoked after one was used | entry point stays hidden |
| Keys exist but none ever used | entry point shown |
| No invoices yet (empty dashboard) | entry point still shows under its own condition |
| Notice-state read fails | `LoadError` via `unwrapPageResult` |
| Dismiss returns `FAILED` | `toast.error` with the result's `error`; notice stays |

## Definition of Done

- [ ] Tests show getDashboardNoticeState is true until dismissOverdueRuleNotice runs (repeat dismiss returns ok), the notice states default, dismissed and dismiss-failed, the entry point renders while hasUsedAnyPersonalKey is false and never after a key passed a key check even if every key is revoked, in the order setup alert, notice, entry point.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
