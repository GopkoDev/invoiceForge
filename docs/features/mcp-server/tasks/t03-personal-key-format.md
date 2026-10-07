---
id: T03
title: "Generate, checksum and digest ifk_ Personal keys"
layer: "domain"
deps: []
blocks: ["T09", "T11"]
acs: ["AC-02", "AC-07"]
files_hint: ["lib/services/personal-keys/key-format.ts", "tests/unit/services/personal-key-format.test.ts"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T03 — Generate, checksum and digest ifk_ Personal keys

## Place in the sequence

- **Blocked by:** — · **Blocks:** T09 — Create, list and revoke Personal keys through the business layer and server actions, T11 — Authenticate a presented Personal key and record its last use and weekly usage · **Wave:** 1 — pure, no schema needed.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** to create a named Personal key from a visible "Connect your AI" entry point and get ready-to-paste setup and example prompts for my assistant
> **So that** my assistant can answer questions about my invoices without me opening the app
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

> **As a** Freelancer
> **I want** my data readable only through a valid, unrevoked Personal key of mine, at a bounded rate, and never changeable through it
> **So that** a leaked, revoked or guessed key, or another Freelancer's key, cannot expose or alter my data
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

This task delivers the key itself: a recognisable, checksummed secret that is stored only as a digest and rejected early when malformed.

## Inlined context

> **Chosen:** Option 1. **SHA-256 digest** — key = `ifk_` + 32 random bytes (base62) + a checksum suffix; store `sha256(key)` under a unique index plus the last four characters; look up by digest. With 256 bits of randomness a fast digest is not brute-forceable even from a database dump, so slow hashing buys nothing and costs latency on every call; a pepper adds a setting whose loss or rotation silently kills every key. The checksum lets the handler refuse malformed keys before any lookup and lets scanners verify a match offline.
>
> — `adr/0004-store-personal-keys-as-sha-256-digests-of-prefixed-random-secrets.md, Option 1 + Decision outcome, abridged` · full text: [ADR-0004](../adr/0004-store-personal-keys-as-sha-256-digests-of-prefixed-random-secrets.md)

> A Personal key created on the Connect your AI page: `ifk_` + 43 base62 characters of secret (32 random bytes, left-padded) + a 6-character base62 checksum — 53 characters in all (`PersonalKeyValue`). The checksum is verified before any lookup. Never a browser session.
>
> — `contracts/openapi.yaml, securitySchemes.PersonalKey, verbatim` · full text: [openapi.yaml](../contracts/openapi.yaml)

> **Hard rule:** The full key is shown once and never stored in readable form.
>
> — `spec.md §6.1, AuthZ/AuthN impact, verbatim` · full text: [spec.md](../spec.md)

> **Hard rule:** **Never** log or report the `Authorization` header, a key, a key digest, or answer bodies.
>
> — `sad.md §8, Logging, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes. (The values produced map onto `PersonalKey.digest` — lower-case hex SHA-256 of the full key — and `PersonalKey.lastFour`, created in T01.)

— `data-model.md §Entities, PersonalKey digest/lastFour, abridged` · full text: [data-model.md](../data-model.md)

## API contract

- `PersonalKeyValue`: `type: string`, `pattern: "^ifk_[0-9A-Za-z]{49}$"`, `minLength: 53`, `maxLength: 53`.

— `contracts/openapi.yaml, components.schemas.PersonalKeyValue, abridged` · full text: [openapi.yaml](../contracts/openapi.yaml)

Module exports: `generatePersonalKey() → { fullKey, digest, lastFour }`, `isWellFormedKey(s)` (prefix, length, base62, checksum), `digestKey(s)`.

## Acceptance criteria

### AC-02 — happy path

> **Given** a Freelancer on the connect page
> **When** they create a Personal key named "Laptop assistant"
> **Then** the full key is shown exactly once, with a copy action and a warning that it will not be shown again. The page also shows setup steps for each supported assistant, which keep the key in a private setting rather than in a project file, and three example prompts. After leaving the page, the key is shown only by its name, creation date and last four characters
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

### AC-07 — authorization

> **Given** an Assistant presenting a key that is revoked, unknown, malformed, or belongs to a deleted account
> **When** it asks for anything
> **Then** the system refuses without returning any Freelancer data and without revealing whether the key ever existed or whose it was. The refusal tells the Assistant to ask the Freelancer for a valid key
>
> — `spec.md §5, AC-07, verbatim` · full text: [spec.md](../spec.md)

(This task owns the format half: "last four characters" and the malformed-key check; the refusal itself is T11/T12.)

## Checklist

- [ ] `lib/services/personal-keys/key-format.ts` (`server-only`): 32 bytes from `crypto.randomBytes` → base62, left-padded to 43; 6-char base62 checksum over `ifk_` + secret; `digestKey` = lower-case hex SHA-256 of the full 53-char key; `lastFour` = last four characters.
- [ ] `isWellFormedKey` — constant-shape checks only (prefix, length, alphabet, checksum); never throws on arbitrary input.
- [ ] `tests/unit/services/personal-key-format.test.ts` — pattern match over many generated keys, checksum failure on a one-character change, digest known-answer, `lastFour`, rejection of empty / wrong prefix / wrong length / non-base62 / non-string input.

## Edge cases

| Case | Behaviour |
|---|---|
| Random bytes encode to fewer than 43 base62 chars | left-padded, always 53 chars total |
| Key with surrounding whitespace or lower-case `IFK_` | not well-formed (no normalisation) |
| Valid format, wrong checksum | not well-formed — caller refuses with no DB lookup |
| Very long input (header abuse) | rejected on length before hashing |

## Definition of Done

- [ ] Unit tests show generated keys match ^ifk_[0-9A-Za-z]{49}$ with a valid 6-char checksum, a one-character change fails the checksum, digest is lower-case hex SHA-256 and lastFour is the last four characters, and parse rejects malformed input without touching any store.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
