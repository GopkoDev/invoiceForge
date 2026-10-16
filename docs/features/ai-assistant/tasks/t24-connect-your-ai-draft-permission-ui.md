---
id: T24
title: "Add the Draft permission choice, the permission badges, the read-only explanation and the lift action to Connect your AI"
layer: "ui"
deps: ["T17"]
blocks: []
acs: ["AC-25", "AC-26", "AC-28"]
files_hint: ["components/assistants/key-create-form.tsx", "components/assistants/key-list.tsx", "components/assistants/assistant-keys.tsx", "app/(protected)/settings/assistants/page.tsx", "tests/component/assistants-keys.test.tsx", "tests/component/assistants-draft-permission.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T24 — Add the Draft permission choice, the permission badges, the read-only explanation and the lift action to Connect your AI

## Place in the sequence

- **Blocked by:** T17 — Count Assistant drafts per key per local day, take a slot inside the create transaction and lift the limit by 50 once reached · **Blocks:** nothing — a leaf of the graph · **Wave:** 4 — needs canCreateDrafts, draftsToday and liftKeyDraftLimit.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** to create a new Personal key with Draft permission, keep my existing keys read-only, and control how many drafts a key may create per day
> **So that** my own AI client can draft invoices without a leaked key ever flooding my account
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task gives Freelancers the only place to grant Draft permission — a new key — and the controls to see and lift each key's daily draft limit.

## Inlined context

**SCR-07 — Connect your AI page (existing), changed states:**

| State | Trigger / condition | Components |
|---|---|---|
| default | `listPersonalKeys` (flow 10). Intro copy becomes: "Let Claude or Cursor read your invoices and answer money questions. A key can also create draft invoices if you allow it when you create the key. An assistant can never issue, send, edit or delete an invoice." Each active key row gains a `Badge`: "Can create drafts" or "Read-only" (AC-25). A draft key also shows "Drafts today: {created} of {allowance}" and, when set, "Limit last lifted {date, time}" (AC-28). Revoked keys show neither | `KeyList`, `Item`, `Badge` |
| read-only explanation | At least one active key is read-only, including every key from before this release (AC-26). An info `Alert` above the active keys: "Read-only keys can't be given Draft permission. To let an assistant create drafts, create a new key with Draft permission, then revoke the old one." No row offers a way to add the permission | `Alert` |
| limit reached | A draft key with `created ≥ allowance` today: the count reads "Drafts today: 50 of 50 · limit reached" and a "Lift limit" `Button` appears on that row (AC-28). The button exists only while the limit is reached | `Button`, `Badge` |
| lifting | "Lift limit" pressed: `Spinner` in the button, the button disabled (a double click lifts once) | `Spinner` |
| lifted | `liftKeyDraftLimit` → `ok`: `toast.success` "Limit lifted: 50 more drafts until midnight your time."; the row reads "Drafts today: 50 of 100" and "Limit last lifted {now}"; "Lift limit" disappears until the limit is reached again (AC-28) | `Sonner` |
| lift-conflict | `CONFLICT`: `toast.error` "The limit can be lifted once the key has reached it." verbatim; the list refreshes | `Sonner` |
| lift-not-found | `NOT_FOUND` (revoked in another tab, or read-only): `toast.error` "Key not found." verbatim; the list refreshes | `Sonner` |

**SCR-08 — New key form (existing `KeyCreateForm`, extended):** default — the form gains a `Checkbox` "Allow this key to create draft invoices", unchecked by default, with `FieldDescription` "The assistant can create drafts for you to review. It can never issue or send them. You can't change this later." `createPersonalKey` receives `canCreateDrafts`. creating — the name `Input` and the `Checkbox` are disabled. key-created — the new key heads the list with "Can create drafts" or "Read-only" as chosen; the form clears and the `Checkbox` resets to unchecked. validation / create-failed — the `Checkbox` keeps its value.

— `screens.md §SCR-07, §SCR-08, abridged` · full text: [screens.md](../screens.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([screens.md](../screens.md) SCR-07/08 wireframes · [server-actions.md](../contracts/server-actions.md) §Personal keys) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `createPersonalKey({ name, canCreateDrafts })` — unchanged result `{ key, fullKey }`.
- `PersonalKeySummary` — `canCreateDrafts: boolean`; `draftsToday: { created; allowance; lastLiftedAt | null } | null` (null for read-only keys).
- `liftKeyDraftLimit(keyId)` → `ok({ created, allowance, lastLiftedAt })` · `fail('CONFLICT', 'The limit can be lifted once the key has reached it.')` · `fail('NOT_FOUND', 'Key not found.')`.

— `contracts/server-actions.md §Personal keys, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-25 — happy path

> **Given** a Freelancer on the page where they connect their own AI client
> **When** they create a new Personal key and choose to give it Draft permission
> **Then** the key is created and shown once as before, and the key list marks it as able to create drafts
>
> — `spec.md §5, AC-25, verbatim` · full text: [spec.md](../spec.md)

### AC-26 — domain invariant

> **Given** a Personal key created without Draft permission, including every key that existed before this release
> **When** the Freelancer looks for a way to give it Draft permission
> **Then** there is none; the page explains that drafting needs a new key with Draft permission, which they can create and then revoke the old key
>
> — `spec.md §5, AC-26, verbatim` · full text: [spec.md](../spec.md)

### AC-28 — happy path

> **Given** a Personal key that has reached its daily draft limit
> **When** the Freelancer lifts the limit for that key on the page where keys are managed
> **Then** the key can create up to another 50 drafts until the end of today in the Freelancer time zone, and the page shows when the limit was last lifted. A limit can be lifted only once it is reached. Each lift adds 50 for today only, and lifts can be repeated. The next day the key starts again at 50.
>
> — `spec.md §5, AC-28, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Draft permission `Checkbox` + description, reset after create — `components/assistants/key-create-form.tsx`
- [ ] Row badges, drafts today, last lift, "Lift limit" with pending state and toasts — `components/assistants/key-list.tsx`
- [ ] Read-only explanation `Alert`; intro copy — `components/assistants/assistant-keys.tsx`, `app/(protected)/settings/assistants/page.tsx`
- [ ] Component tests for every state above — `tests/component/assistants-keys.test.tsx`, `tests/component/assistants-draft-permission.test.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| Only draft keys | no read-only explanation |
| No keys | existing `Empty`, no explanation |
| Revoked keys | no badge, no counts |
| Double click on "Lift limit" | one call (pending disables) |
| `UNAUTHORIZED` action | `goToSignIn()` |

## Definition of Done

- [ ] Component tests render SCR-07 default (badges, drafts today, last lift), read-only explanation, limit reached with "Lift limit", lifting, lifted, lift-conflict and lift-not-found, and SCR-08 with the unchecked Draft permission checkbox passed to createPersonalKey and reset after creation.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
