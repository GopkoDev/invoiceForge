---
id: T14
title: "Show \"you can export again at …\" as an inline alert on the privacy settings screen"
layer: "ui"
deps: ["T13"]
blocks: ["T20"]
acs: ["AC-24"]
files_hint: ["components/settings/gdpr-settings.tsx", "tests/component/gdpr-settings.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
---

# T14 — Show "you can export again at …" as an inline alert on the privacy settings screen

## Place in the sequence

- **Blocked by:** T13 — Limit data exports per Freelancer in the business layer and return RATE_LIMITED with a retry time. **Blocks:** T20 — Gate the release on a zero-violation CSP e2e run, a genuine-session page sweep and a clean advisory audit. **Wave:** 6 — parallel with T11.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** my full data export limited to a few runs per hour, with failed runs not counted
> **So that** a leaked session or a looping script cannot overload the app, while I can still export whenever I need
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

This task tells the Freelancer, on SCR-06, exactly when they can export again.

## Inlined context

> **SCR-06 — Privacy & data settings.** rate-limited: `429` `RATE_LIMITED` with `details.retryAt`. **D-S3:** an inline `Alert` inside the export card reads "You've reached the export limit. You can export again at {retryAt as local HH:mm}." No toast, and no `error.tsx`. The button stays enabled, and the alert clears on the next export attempt — `Alert`, `AlertTitle`. error: `500` → existing `toast.error` "Your data couldn't be exported. Try again." unauthorized: `401` → `goToSignIn()` (unchanged). loading / success unchanged (`Button`, `Spinner`, `Sonner`). Reuse `GdprSettings`; no new component.
>
> — `screens.md §SCR-06, abridged` · full text: [screens.md](../screens.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [screens.md](../screens.md) · [openapi.yaml](../contracts/openapi.yaml)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

- Consumes `GET /api/user/export` → `429` body `{ success:false, code:'RATE_LIMITED', error, details:{ kind:'RETRY_AT', retryAt } }` (`retryAt` ISO UTC) + `Retry-After`.

— `contracts/openapi.yaml, operationId exportUserData 429, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

## Acceptance criteria

### AC-24 — domain invariant

> **Given** a Freelancer has completed 3 data exports in the past hour
> **When** they request a fourth
> **Then** the system refuses and tells them when they can export again. An export counts from the moment it starts, so several requests sent at once never run more than 3. An export that failed on the system's side frees its place again; one the Freelancer abandoned after the file was produced still counts
>
> — `spec.md §5, AC-24, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] `components/settings/gdpr-settings.tsx` — on `429`, parse the body, format `retryAt` as local `HH:mm`, render `Alert` + `AlertTitle` in the export card with the D-S3 text; no toast.
- [ ] Clear the alert when a new export attempt starts; keep the button enabled.
- [ ] Apply the same handling in both export entry points in the file (settings card and delete dialog's export).
- [ ] `tests/component/gdpr-settings.test.tsx` — 429 shows the alert with the local time and no toast; next attempt clears it; 500 still toasts; 401 still goes to sign-in.

## Edge cases

| Case | Behaviour |
|---|---|
| `429` with malformed / missing `retryAt` | show the alert with the server `error` text, no time |
| Second click after 429 | alert clears, request runs, new outcome shown |
| `500` | existing toast, no alert |
| `401` | `goToSignIn()` |

## Definition of Done

- [ ] component tests for the rate-limited, error and unauthorized states pass
- [ ] the alert uses existing `Alert`/`AlertTitle` primitives, no new component
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck + unit + integration clean
