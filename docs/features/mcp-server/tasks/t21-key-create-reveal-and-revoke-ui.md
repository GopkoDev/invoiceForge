---
id: T21
title: "Build key creation, the one-time reveal, the key lists and revoke confirmation on Connect your AI"
layer: "ui"
deps: ["T09", "T20"]
blocks: []
acs: ["AC-02", "AC-03", "AC-04", "AC-05", "AC-06"]
files_hint: ["app/(protected)/settings/assistants/page.tsx", "components/assistants/key-create-form.tsx", "components/assistants/key-reveal.tsx", "components/assistants/key-list.tsx", "tests/component/assistants-keys.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T21 — Build key creation, the one-time reveal, the key lists and revoke confirmation on Connect your AI

## Place in the sequence

- **Blocked by:** T09 — Create, list and revoke Personal keys through the business layer and server actions · T20 — Add the Connect your AI settings page with setup steps, example prompts and a CopyButton · **Blocks:** — · **Wave:** 3 — needs the key actions and the page shell.
- **Lane:** shares `app/(protected)/settings/assistants/page.tsx` with T20 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to create a named Personal key from a visible "Connect your AI" entry point and get ready-to-paste setup and example prompts for my assistant
> **So that** my assistant can answer questions about my invoices without me opening the app
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** to see each Personal key with its name and last use, and revoke any of them
> **So that** I stay in control of which Assistants can read my data
>
> — `spec.md §4, US-02, verbatim` · full text: [spec.md](../spec.md)

This task builds the key part of SCR-03 and the SCR-04 revoke confirmation over the T09 actions.

## Inlined context

> | default | `listPersonalKeys` → at least one key (AC-05; flow 3). **Active keys** (`createdAt` DESC): name · "Created {date}" · `••••{lastFour}` · "Last used {date, time}" or "Never used" · Revoke. **Revoked keys** (`createdAt` DESC): name · `••••{lastFour}` · "Revoked {date}", with no action (AC-06) | `Card`, `Field`, `Input`, `Button`, `Tabs`, `InputGroup`, `NEW: CopyButton`, `Item`, `Tooltip` |
> | empty | No keys, active or revoked: the active list shows `Empty` "No keys yet. Create one above to connect your first assistant." The revoked section is hidden while it has no rows | `Empty` |
> | creating | Create clicked: `Spinner` in Create; Create and the name `Input` are disabled | `Spinner` |
> | key-created | `createPersonalKey` → `ok({ key, fullKey })`. A reveal `Alert` shows `fullKey` in a read-only `InputGroup` with a `CopyButton`, plus the warning. While the reveal is visible, the setup snippets fill in `fullKey` instead of `YOUR_KEY`. The new key heads the active list as "Never used". The name `Input` is cleared. The reveal stays until the Freelancer leaves the page; a second create replaces it with the newer key. After leaving, the key shows only as name, date and `••••lastFour` | `Alert`, `InputGroup`, `NEW: CopyButton`, `Item` |
> | validation | `VALIDATION` with `fieldErrors.name` … `FieldError` with `KEY_NAME_MESSAGE` verbatim, the typed name kept, nothing created. The client runs `personalKeyNameSchema` first and shows the same message | `FieldError` |
> | limit | `CONFLICT` (10 active keys). A destructive `Alert` above the form shows `KEY_LIMIT_MESSAGE` verbatim, nothing is created, and the revoke actions below stay available. The `Alert` clears on the next submit or after a revoke | `Alert` |
> | create-failed | `FAILED`: `toast.error` "Could not create the key. Try again." (verbatim). The name is kept | `Sonner` |
> | revoked | SCR-04 confirmed → `revokePersonalKey` → `ok()`. The row moves to Revoked keys with today's date, with no reactivate action, and `toast.success` "Key revoked." If that key's reveal is still visible, the reveal disappears too | `Item`, `Sonner` |
> | revoke-not-found | `NOT_FOUND`: `toast.error` "Key not found." verbatim, and the list refreshes | `Sonner` |
> | error | `listPersonalKeys` fails → `unwrapPageResult` → existing `(protected)/error.tsx` (`LoadError`). An `UNAUTHORIZED` result from any action → sign-in | `LoadError` |
>
> Reveal copy: "Your new key "{name}"" / "Copy it now. You won't be able to see it again." Active heading "Active keys ({n} of 10)". Phone: each key row stacks name / meta lines / a full-width [Revoke].
>
> — `screens.md §SCR-03, states + wireframes, abridged` · full text: [screens.md](../screens.md)

> SCR-04 — the existing `ConfirmationModal`, opened by Revoke on an active key row. States: default (destructive confirm) · cancelled (Cancel, Esc or click outside: closes, key stays active) · pending (`Spinner` in Revoke, both buttons disabled, dialog stays open) · success (`ok()` → caller closes → SCR-03 `revoked`) · not-found (`NOT_FOUND` → caller closes → SCR-03 `revoke-not-found`) · rejected (rejects or `UNAUTHORIZED` → `goToSignIn()`, built into `ConfirmationModal`). Copy: "Revoke "{name}"?" / "Any assistant using this key stops working right away. This can't be undone: you'll need a new key to reconnect." / [Cancel] [Revoke key].
>
> — `screens.md §SCR-04, abridged` · full text: [screens.md](../screens.md)

> **Dates:** every date and time shown is in the Freelancer time zone (UTC until one is saved), in the app's existing date format.
>
> — `screens.md §Source, Dates, verbatim` · full text: [screens.md](../screens.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [screens.md](../screens.md) · [server-actions.md](../contracts/server-actions.md) ·
[sad.md](../sad.md)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- `createPersonalKey({ name })` → `ok({ key: PersonalKeySummary, fullKey })` · `VALIDATION` `KEY_NAME_MESSAGE` + `fieldErrors.name` · `CONFLICT` `KEY_LIMIT_MESSAGE` · `FAILED` "Could not create the key. Try again."
- `revokePersonalKey(id)` → `ok()` · `NOT_FOUND` "Key not found."
- `listPersonalKeys(actor)` → `{ active: PersonalKeySummary[], revoked: RevokedPersonalKeySummary[] }`; `PersonalKeySummary = { id, name, createdAt, lastFour, lastUsedAt | null }`, revoked adds `revokedAt`.
- `KEY_NAME_MESSAGE = 'The name must be 1 to 50 characters and different from your other active keys.'` · `KEY_LIMIT_MESSAGE = 'At most 10 keys can be active at once. Revoke one to make room.'` · `personalKeyNameSchema = z.string().trim().min(1).max(50)`.

— `contracts/server-actions.md §Personal keys, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-02 — happy path

> **Given** a Freelancer on the connect page
> **When** they create a Personal key named "Laptop assistant"
> **Then** the full key is shown exactly once, with a copy action and a warning that it will not be shown again. The page also shows setup steps for each supported assistant, which keep the key in a private setting rather than in a project file, and three example prompts. After leaving the page, the key is shown only by its name, creation date and last four characters
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-03 — error

> **Given** a Freelancer creating a Personal key
> **When** the name is empty, longer than 50 characters, or the same as one of their other active keys
> **Then** the system does not create the key and tells them the name must be 1 to 50 characters and different from their other active keys. Spaces at either end are removed before checking, and names that differ only in letter case count as the same
>
> — `spec.md §5, AC-03, verbatim` · full text: [spec.md](../spec.md)

### AC-04 — domain invariant

> **Given** a Freelancer who already has 10 active Personal keys
> **When** they try to create another
> **Then** the system refuses and tells them that at most 10 keys can be active at once and that they can revoke one to make room
>
> — `spec.md §5, AC-04, verbatim` · full text: [spec.md](../spec.md)

### AC-05 — happy path

> **Given** a Freelancer with three Personal keys, one of which has never been used
> **When** they open the connect page
> **Then** each active key shows its name, creation date, last four characters and last use, accurate to within 5 minutes, or "never used". Last use is the latest call presented with the key that passed the key check, including tool listings and calls refused by the call limit. Each has a revoke action. Revoked keys are listed separately with their revocation date
>
> — `spec.md §5, AC-05, verbatim` · full text: [spec.md](../spec.md)

### AC-06 — happy path

> **Given** a Freelancer revokes a Personal key and confirms
> **When** an Assistant calls with that key and the key is checked after the revocation was confirmed, even for a call that was already waiting
> **Then** the call is refused and returns no data, and the key moves to the revoked list. A call whose key check passed before the revocation was confirmed may finish. A revoked key can never be reactivated
>
> — `spec.md §5, AC-06, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `components/assistants/key-create-form.tsx` — name `Field` + `Input`, client `personalKeyNameSchema`, `FieldError`, limit `Alert`, `Spinner`, toasts.
- [ ] `components/assistants/key-reveal.tsx` — `Alert` + read-only `InputGroup` + `CopyButton`; lifts `fullKey` so `SetupSteps` (T20) fills it in.
- [ ] `components/assistants/key-list.tsx` — active `Item`s with Revoke → `ConfirmationModal` (SCR-04), revoked section, `Empty` state.
- [ ] Wire into `app/(protected)/settings/assistants/page.tsx` — RSC reads `listPersonalKeys` via `unwrapPageResult`; reveal state lives only in client memory.
- [ ] `tests/component/assistants-keys.test.tsx` — every SCR-03 key state and SCR-04 state.

## Edge cases

| Case | Behaviour |
|---|---|
| Name "  laptop ASSISTANT " when "Laptop assistant" is active | `FieldError` `KEY_NAME_MESSAGE`, typed name kept |
| Duplicate name and 10 active keys at once | name refusal wins (server order) |
| Second create while a reveal is visible | reveal replaced by the newer key |
| Revoking the key whose reveal is visible | reveal disappears too |
| Key already revoked in another tab | `toast.error` "Key not found.", list refreshes |
| Revoke rejected / `UNAUTHORIZED` | `goToSignIn()` |
| Page reload after create | no `fullKey` anywhere; only name, date, `••••lastFour` |

## Definition of Done

- [ ] Component tests cover SCR-03 default, empty, creating, key-created (reveal with copy and warning, snippets filled), validation and limit messages verbatim, create-failed, revoked, revoke-not-found and error, and SCR-04 default, cancelled, pending, success, not-found and rejected.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
