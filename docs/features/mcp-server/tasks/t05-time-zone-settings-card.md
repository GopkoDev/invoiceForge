---
id: T05
title: "Add the Time zone card to Profile settings"
layer: "ui"
deps: ["T04"]
blocks: []
acs: ["AC-22"]
files_hint: ["components/settings/time-zone-settings.tsx", "components/settings/profile-settings-loading.tsx", "components/settings/index.ts", "app/(protected)/settings/profile/page.tsx", "tests/component/time-zone-settings.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T05 — Add the Time zone card to Profile settings

## Place in the sequence

- **Blocked by:** T04 — Read the Freelancer time zone from the account in both ActingFreelancer factories and save it from settings · **Blocks:** — · **Wave:** 3 — needs `getProfile().timeZone` and `updateTimeZone`.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** my time zone saved on my account and used by the dashboard and by every Assistant
> **So that** "overdue", "today" and "this month" mean the same thing wherever I ask
>
> — `spec.md §4, US-07, verbatim` · full text: [spec.md](../spec.md)

This task gives the Freelancer the place to see and change the saved zone.

## Inlined context

> **SCR-02 — Profile settings.** Changed: a new "Time zone" card under the existing profile card. It has its own Save and calls `updateTimeZone`, separate from the profile form.
>
> | State | Trigger / condition | Components |
> |---|---|---|
> | loading | Page request in flight | `ProfileSettingsLoading` + one more `Skeleton` card |
> | default | `getProfile().timeZone` is set. The `Combobox` shows it and searches the zone list by name or city (AC-22) | `Card`, `Field`, `FieldLabel`, `FieldDescription`, `Combobox`, `Button` |
> | not-set | `timeZone` is `null` (not saved yet). The `Combobox` is empty, and the description says UTC is used | as default |
> | saving | Save clicked: `Spinner` in Save; Save and the `Combobox` are disabled | `Spinner` |
> | success | `updateTimeZone` → `ok()`: `toast.success` "Time zone saved." The card shows the new zone | `Sonner` |
> | validation | `updateTimeZone` → `VALIDATION`: `FieldError` with `TIME_ZONE_MESSAGE` verbatim. Nothing saved | `FieldError` |
> | error | `FAILED` → `toast.error` with the result's `error`; `UNAUTHORIZED` → sign-in. Page load failure → existing `error.tsx` | `Sonner`, `LoadError` |
> | empty | N/A: a signed-in Freelancer always has a profile | — |
>
> — `screens.md §Screens, SCR-02, abridged` · full text: [screens.md](../screens.md)

> ```text
> | Time zone                                                    |
> | Used for "today", month boundaries and overdue on your       |
> | dashboard and in your AI assistant's answers.                |
> | [ Europe/Kyiv (UTC+03:00)                    v ]   [Save]    |
>   not-set:    [ Choose a time zone               v ]   [Save]
>               Not set yet. UTC is used until you choose one.
>   validation: [ Mars/Olympus                     v ]   [Save]
>               ! Choose a time zone from the list.
> ```
>
> — `screens.md §Screens, SCR-02 wireframe, abridged` · full text: [screens.md](../screens.md)

> **Hard rule:** Strings are inline (no i18n layer). Where the contract fixes a message (`TIME_ZONE_MESSAGE`), the UI shows it **verbatim** from the result's `error` / `fieldErrors`. Error routing: `UNAUTHORIZED` or a rejected call goes to sign-in through `redirectIfUnauthorized` / `goToSignIn()`; `VALIDATION` with `fieldErrors` shows a `FieldError` next to its field.
>
> — `screens.md §Source, Strings + Error routing, abridged` · full text: [screens.md](../screens.md)

> **Hard rule:** UI architecture unchanged — composed from the existing shadcn/ui primitives and tokens (`docs/design-system.md`). Posture: responsive-both — every state works at desktop and phone widths.
>
> — `sad.md §4, UI architecture` + `screens.md §Source, Posture, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [screens.md](../screens.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Calls `updateTimeZone(timeZone: string)` → `ok()` | `VALIDATION` (`fieldErrors.timeZone: [TIME_ZONE_MESSAGE]`) | `FAILED` | `UNAUTHORIZED`.
- Reads `getProfile().timeZone: string | null`.
- `TIME_ZONE_MESSAGE = 'Choose a time zone from the list.'`

— `contracts/server-actions.md §Freelancer time zone, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-22 — happy path

> **Given** a Freelancer with no saved time zone whose browser reports the Kyiv time zone
> **When** they next open the app
> **Then** the Kyiv time zone is saved as their Freelancer time zone and shown in settings, where they can change it. After a change, the dashboard and every Assistant answer use the new time zone from the next request. Until a time zone is saved, the dashboard and every Assistant answer use UTC, and Assistant answers name UTC as the time zone used
>
> — `spec.md §5, AC-22, verbatim` · full text: [spec.md](../spec.md)

(This task owns "shown in settings, where they can change it".)

## Checklist

- [ ] `components/settings/time-zone-settings.tsx` — client card: `Card` + `Field` + `Combobox` (IANA zones from `Intl.supportedValuesOf('timeZone')`, label with UTC offset) + Save `Button`; calls `updateTimeZone`.
- [ ] `components/settings/profile-settings-loading.tsx` — one more `Skeleton` card.
- [ ] `components/settings/index.ts` — export the card.
- [ ] `app/(protected)/settings/profile/page.tsx` — render the card under the profile card with `getProfile().timeZone`.
- [ ] `tests/component/time-zone-settings.test.tsx` — every SCR-02 state.

## Edge cases

| Case | Behaviour |
|---|---|
| Save clicked with no change | allowed; `ok()` → success toast |
| Save clicked with nothing chosen (not-set) | Save disabled until a zone is chosen |
| Server returns `VALIDATION` for a zone the client listed | `FieldError` with `TIME_ZONE_MESSAGE`; value kept |
| Phone width | card stacks; `Combobox` full width, Save below |

## Definition of Done

- [ ] Component tests cover SCR-02 default, not-set, saving, success, validation (TIME_ZONE_MESSAGE verbatim) and FAILED/UNAUTHORIZED states, and the profile page renders the card under the existing profile card.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
