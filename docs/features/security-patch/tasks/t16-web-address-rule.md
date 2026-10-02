---
id: T16
title: "Accept only http(s) web addresses for website and image fields, in forms and the business layer"
layer: "domain"
deps: ["T1"]
blocks: ["T17"]
acs: ["AC-21"]
files_hint: ["lib/validations/web-address.ts", "lib/validations/customer.ts", "lib/validations/sender-profile.ts", "lib/validations/profile.ts", "lib/services/customers/", "lib/services/sender-profiles/", "lib/services/profile/", "tests/unit/lib/validations/", "tests/integration/services/customers/"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

# T16 — Accept only http(s) web addresses for website and image fields, in forms and the business layer

## Place in the sequence

- **Blocked by:** T1 — Upgrade Next.js to 16.3.x, next-auth to 5.0.0-beta.32 and nodemailer to 10.x in one change · **Blocks:** T17 — Render legacy non-web addresses as plain text and never load them as images · **Wave:** 2 (hardening builds on the upgraded stack; SAD §11 risk row 1).
- **Lane:** shares the test dir `tests/unit/lib/validations/` with T6 and T11 (separate test files, no source overlap) — otherwise own lane, parallel with T2, T4, T6, T10, T18.

## Why (user story)

> **As a** Freelancer
> **I want** the app to tell my browser to block injected content, refuse framing, use encrypted connections only, and accept only web addresses as customer websites
> **So that** a malicious link or stored value cannot run in my session
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

This task delivers the save side of that story: one shared `isWebAddress` rule that forms and the business layer both apply, so `javascript:` and `data:` values are never saved again.

## Inlined context

> One shared refine, `isWebAddress(value)`. It is true only when `new URL(value).protocol` is `http:` or `https:`. It is used by the forms (zod resolver) and again by the business layer. A bypassed form gets `VALIDATION` with field errors and nothing is saved (flow 7).
>
> | Action / function | Field | Rule | Message |
> |---|---|---|---|
> | `createCustomer` / `updateCustomer` | `website`, `image` | ★ `isWebAddress`, replacing `.url()` (which accepts `javascript:` and `data:`) | `The address must start with http:// or https://.` |
> | `createSenderProfile` / `updateSenderProfile` | `website` | ★ `isWebAddress` | same |
> | `createSenderProfile` / `updateSenderProfile` | `logo` | **unchanged: https only** (architecture-hardening AC-04, stricter than AC-21) | `The link must be a secure web address (https://…).` |
> | `updateProfile` | `image` | ★ `isWebAddress` (decision D-3, beyond AC-21's literal fields) | `The address must start with http:// or https://.` |
>
> - Empty stays allowed where it is today (`optionalString`).
>
> — `contracts/server-actions.md §Web-address rule, table, verbatim` · full text: [server-actions.md](../contracts/server-actions.md)

> D-3: `User.image` (profile settings) accepts any URL scheme and is not named in AC-21 → **User decision:** included under `isWebAddress`, traced to AC-21's "any other web address or image address they type". `tasks` should note it as a contract addition.
> D-4: `SenderProfile.logo` is https-only today; AC-21 allows http or https → **Keep the stricter rule**.
>
> — `contracts/api-sync-report.md §B, D-3 and D-4, abridged` · full text: [api-sync-report.md](../contracts/api-sync-report.md)

> UI->>UI: applies the shared web-address rule, http or https only · alt not a web address → field message, the address must start with http or https · else web address → UI->>S: save · S->>S: applies the same web-address rule again · alt not a web address because the form was bypassed → validation error, nothing saved · else valid → S->>D: save the record (existing columns, no schema change)
>
> — `sad.md §6, Flow 7 (save half), abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Input rules shared by browser and server — dependency-free rules in `lib/validations/`, used by forms and by the server: […] the web-address rule (http or https only; AC-21).
>
> — `sad.md §8, Input rules shared by browser and server, abridged` · full text: [sad.md](../sad.md)

> **Hard rule:** Business functions live in `lib/services/` behind `server-only` and lint bans (service-layer ADR-0006). They take a branded `ActingFreelancer` and return the `ActionResult` union with typed codes.
>
> — `sad.md §2, Conventions, abridged` · full text: [sad.md](../sad.md)

Code facts at breakdown time: `lib/validations/customer.ts:11-12` (`website`, `image`: `.url('Invalid URL')`), `lib/validations/sender-profile.ts:33` (`website`: `.url('Invalid URL format')`), `lib/validations/profile.ts:6` (`image`: `.url('Invalid URL format')`).

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[server-actions.md](../contracts/server-actions.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

| Table | Column | Rule this feature adds (AC-21) |
|---|---|---|
| `Customer` | `website`, `image` | a new or changed value must be an `http:` or `https:` URL, enforced in the zod schemas in `lib/validations/`. No DB constraint, per the repo's no-CHECK convention |
| `SenderProfile` | `logo`, and any other URL field the forms accept | same |
| `Invoice` | the snapshot copies of these fields | never rewritten. A non-web value saved before this change renders as plain text (UI rule, SAD §6 flow 7) |

**No backfill.** AC-21 says stored data is not rewritten, so there is no expand → backfill → contract here.

— `data-model.md §Customer, SenderProfile, verbatim` · full text: [data-model.md](../data-model.md)

No schema change: existing columns only.

## API contract

- `createCustomer` / `updateCustomer`, `createSenderProfile` / `updateSenderProfile`, `updateProfile` → on a non-web value: `fail('VALIDATION', …, { fieldErrors: { <field>: ['The address must start with http:// or https://.'] } })`, nothing saved. Signatures unchanged.

— `contracts/server-actions.md §Web-address rule, abridged` · full text: [server-actions.md](../contracts/server-actions.md)

## Acceptance criteria

### AC-21 (US-08) — error

> **Given** a Freelancer editing a customer or a sender profile
> **When** they save a website, or any other web address or image address they type, that is not a web address (http or https), for example a script or data link
> **Then** the system refuses to save and tells them the address must start with http or https. A non-web value saved before this change, including the copy kept on an issued invoice, is shown as plain text, never as a clickable link or a loaded image; stored data is not rewritten
>
> — `spec.md §5, AC-21, verbatim` · full text: [spec.md](../spec.md)

This task covers the refuse-to-save half; the display half is T17.

## Checklist

- [ ] Add `lib/validations/web-address.ts`: `isWebAddress(value)` (parse with `new URL`, protocol `http:`/`https:` only, unparsable → false) and the exported message constant `The address must start with http:// or https://.`; no server or browser imports.
- [ ] Unit table test in `tests/unit/lib/validations/web-address.test.ts`: `https://a.b`, `http://a.b` true; `javascript:alert(1)`, `JavaScript:…`, `data:image/png;base64,…`, `ftp://x`, `//x`, `x`, leading-space variants false.
- [ ] `lib/validations/customer.ts`: replace `.url()` on `website`, `image` with the refine; keep `optionalString` (empty allowed).
- [ ] `lib/validations/sender-profile.ts`: same for `website`; leave `logo` (https-only) untouched.
- [ ] `lib/validations/profile.ts`: same for `image` (D-3); keep `''` allowed.
- [ ] Confirm the business functions in `lib/services/customers/`, `lib/services/sender-profiles/`, `lib/services/profile/` validate through these schemas (add the parse if one bypasses it) so a bypassed form gets `VALIDATION` + `fieldErrors`.
- [ ] Integration test in `tests/integration/services/customers/`: a `javascript:` website and a `data:` image via the service → `VALIDATION`, row unchanged; a valid https value saves; one case each for sender-profile `website` and profile `image`.

## Edge cases

| Case | Behaviour |
|---|---|
| Empty string / field omitted | allowed, as today |
| `JAVASCRIPT:alert(1)` (uppercase scheme) | refused (`URL` lower-cases protocol) |
| ` https://x` with leading space | trimmed by the existing `.trim()` where present, then accepted; without trim → refused |
| `data:` value in `image` | refused with the web-address message |
| Sender `logo` with `http://` | refused with the existing https-only message (D-4) |
| Form bypassed (direct action call) | service returns `VALIDATION` + `fieldErrors`, nothing saved |
| Existing stored non-web value, unrelated field edited | the stored field is re-validated only if submitted with a value; never rewritten by migration |

## Definition of Done

- [ ] `web-address.test.ts` table passes; customer / sender-profile / profile integration cases pass (refused values not persisted).
- [ ] Logo rule unchanged (existing `sender-profile-logo-validation.test.ts` still green).
- [ ] No DB migration, no data rewrite.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck + unit + integration clean
