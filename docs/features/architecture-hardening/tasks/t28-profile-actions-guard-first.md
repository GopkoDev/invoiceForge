---
id: T28
title: "Check the session before parsing input in profile and account settings actions"
layer: "app"
deps: ["T00", "T08", "T17"]
blocks: []
acs: ["AC-23"]
files_hint: ["lib/actions/profile-actions.ts", "lib/actions/account-actions.ts", "components/settings/profile-settings.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T28 — Check the session before parsing input in profile and account settings actions

## Place in the sequence

- **Blocked by:** T08 — Introduce typed ActionResult error codes and move every action onto them, T17 — Add the deletion summary and delete the account in one explicit transaction · **Blocks:** — · **Wave:** wave 4 — the rest (spec §1).
- **Lane:** shares files with T08 (`lib/actions/profile-actions.ts`), T17 (`lib/actions/account-actions.ts`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to export my data and delete my account completely, even when I have invoices, and to have my account settings changed only from my own signed-in session
> **So that** I can leave the product cleanly and no one else can touch my account
>
> — `spec.md §4, US-05, verbatim` · full text: [spec.md](../spec.md)

This task makes account and profile settings changeable only from the Freelancer's own signed-in session, with no input looked at first (F3).

## Inlined context

> F3 / AC-23: the session check runs **before** `profileFormSchema.parse`. `UNAUTHORIZED` → `VALIDATION` (`name ≤ 50`, `email` format, `image` URL or `''`) → `FAILED`. The shape moves from `{ success, message }` to `ActionResult`.
>
> — `contracts/server-actions.md §updateProfile, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> The canonical action to copy is `lib/actions/customer-actions.ts`. Account and profile actions are the known deviation (F3) this feature removes.
>
> — `sad.md §2, Conventions, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** | Authorization | `getAuthenticatedUser()` (actions) or `requireSession()` (route handlers) runs **first, before any input is parsed**. Every query is scoped by `userId`. A record that isn't the caller's returns `NOT_FOUND`, identical to a missing one |
>
> — `sad.md §8, row Authorization, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** Data access lives in `lib/actions/<domain>-actions.ts`. `getAuthenticatedUser()` runs first, then queries are scoped by `userId` (`lib/helpers/auth-helpers.ts:10`). Actions return `ActionResult<T>` (`types/actions.ts:5`) and never throw to the client.
>
> — `sad.md §2, Conventions, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `updateProfile(data: ProfileFormValues): ActionResult<void>` — `UNAUTHORIZED` before any parsing.

— `contracts/server-actions.md §updateProfile, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-23 — authorization

> **Given** a Visitor with no signed-in session
> **When** the Visitor tries to change account or profile settings
> **Then** the system denies it as "not signed in" before looking at any submitted values
>
> — `spec.md §5, AC-23, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Move `getAuthenticatedUser()` to the first line of every exported action; parse input after; return `ActionResult` — `lib/actions/profile-actions.ts`
- [ ] Sweep the remaining exported actions in `account-actions.ts` for the same order (T17 already rewrote delete/summary)
- [ ] Form reads `ActionResult` (`fieldErrors`, `error`) instead of `message` — `components/settings/profile-settings.tsx`
- [ ] Probe: call the action without a session with an invalid payload → `UNAUTHORIZED`, not a validation error

## Edge cases

| Case | Behaviour |
|---|---|
| No session + invalid payload | `UNAUTHORIZED` (session first) |
| Signed in + name > 50 | `VALIDATION` with field message |

## Definition of Done

- [ ] without a session, `updateProfile` with a malformed payload returns `UNAUTHORIZED` (probe via a signed-out browser form submit or a scratch call) (AC-23)
- [ ] profile update still works signed in
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
