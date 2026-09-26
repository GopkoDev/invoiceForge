---
id: T20
title: "Require an https logo link when saving a sender profile"
layer: "app"
deps: ["T00", "T08"]
blocks: []
acs: ["AC-04"]
files_hint: ["lib/validations/sender-profile.ts", "lib/actions/sender-profile-actions.ts", "components/sender-profiles/sender-profile-form.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T20 — Require an https logo link when saving a sender profile

## Place in the sequence

- **Blocked by:** T08 — Introduce typed ActionResult error codes and move every action onto them · **Blocks:** — · **Wave:** wave 3 — input and link validation (spec §1).
- **Lane:** shares files with T08 (`lib/actions/sender-profile-actions.ts`), T19 (`lib/actions/sender-profile-actions.ts`) — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** my sender profile's logo fetched for my PDFs only from safe, real image links
> **So that** my invoices carry my branding and the app can't be abused to reach internal systems
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task makes every newly stored logo link a secure web address, so the PDF path never meets a plain-http link it has to refuse.

## Inlined context

> AC-04 / flow 5: `logo` must be an **`https:`** URL or empty. Otherwise `VALIDATION`, `fieldErrors.logo = ["The link must be a secure web address (https://…)."]`. The other fields are unchanged (`lib/validations/sender-profile.ts`). The session check runs first.
>
> — `contracts/server-actions.md §updateSenderProfile / createSenderProfile, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

>     S->>S: checks the live session, re-validates with the shared sender-profile schema
>     alt logo link is not a secure web address
>         S-->>UI: field error on the logo field, nothing saved
>         UI-->>U: the link must be a secure web address, shown next to the logo field
>
> — `sad.md §6, flow 5 steps 3–6, verbatim` · full text: [sad.md](../sad.md)

> | validation (logo) | `VALIDATION` with `fieldErrors.logo`: "The link must be a secure web address (https://…)." shown next to the logo field. Nothing is saved and the values are kept (AC-04; flow 5) | `FieldError` | wireframe below |
> | save-not-found | Save → `NOT_FOUND`: `toast.error` with the result's `error` | `Sonner` | — |
>
> — `screens.md §SCR-05 Sender profile editor, changed states, verbatim` · full text: [screens.md](../screens.md)

> **Hard rule:** | Authorization | `getAuthenticatedUser()` (actions) or `requireSession()` (route handlers) runs **first, before any input is parsed**. Every query is scoped by `userId`. A record that isn't the caller's returns `NOT_FOUND`, identical to a missing one |
>
> — `sad.md §8, row Authorization, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** | Input validation | Every action re-runs the entity's zod schema, **with no `as` casts that bypass it** (L8). **Link parameters are parsed with fallback-to-default schemas**: page ≥ 1, page size ∈ {10, 20, 30, 50, 100} (the sizes the list offers, `components/invoices/invoices-table-footer.tsx:29`), sort field, order, status and tab from enums; anything invalid becomes its default, and the controls show what was applied |
>
> — `sad.md §8, row Input validation, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Column | Type | Constraints | Change |
|---|---|---|---|
| `SenderProfile.logo` | TEXT | NULL | now validated as an `https:` URL on save (AC-04) |

— `data-model.md §Entities, SenderProfile logo row, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `createSenderProfile(data)`, `updateSenderProfile(id, data)` → `VALIDATION` + `fieldErrors.logo` for a non-https link.

— `contracts/server-actions.md §Sender profiles and customers, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-04 — error

> **Given** a Freelancer editing a sender profile
> **When** the Freelancer saves a logo link that is not a secure web address
> **Then** the system blocks the save and shows, next to the logo field, that the link must be a secure web address
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `logo`: `z.union([z.literal(''), z.string().url().refine(u => new URL(u).protocol === 'https:', msg)])` with the contract message — `lib/validations/sender-profile.ts`
- [ ] Both actions: guard first, then `safeParse` (no casts), `VALIDATION` with `fieldErrors` from the zod error — `lib/actions/sender-profile-actions.ts`
- [ ] Form: show `fieldErrors.logo` next to the logo field, keep values; `NOT_FOUND` → `toast.error` — `components/sender-profiles/sender-profile-form.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| `http://example.com/logo.png` | Blocked with the field message; nothing saved |
| Empty logo | Allowed (no logo) |
| `HTTPS://EXAMPLE.COM/x.png` | Allowed (protocol compare is case-insensitive via `URL`) |
| `javascript:` / `data:` URL | Blocked with the same message |

## Definition of Done

- [ ] in `pnpm dev`: saving a sender profile with an http logo shows the SCR-05 validation state and saves nothing; https saves (AC-04)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
