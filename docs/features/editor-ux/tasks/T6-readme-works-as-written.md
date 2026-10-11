---
id: T6
title: "Rewrite the README setup and test steps and verify them in a fresh clone"
layer: "docs"
deps: []
blocks: []
acs: ["AC-15"]
files_hint: ["README.md", ".env.example"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task. Every inlined chunk carries a provenance signature; the source always wins.
To the executing agent: work from what is inlined here. If a slice is insufficient, ambiguous, or
contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T6 — Rewrite the README setup and test steps and verify them in a fresh clone

## Place in the sequence

- **Blocked by:** nothing (can start at once) · **Blocks:** nothing · **Wave:** DAG wave 1; delivery wave 1 of spec §1.
- **Lane:** own lane.

## Why (user story)

> **As a** Contributor
> **I want** a README whose steps work verbatim and a codebase without unused components or duplicate files
> **So that** I can run, test and change the app without chasing dead ends
>
> — `spec.md §4, US-08, verbatim` · full text: [spec.md](../spec.md)

Gives the Contributor setup and test steps that work verbatim.

## Inlined context

> A Contributor opening the repository finds … a README whose setup command and links point at files that don't exist.
>
> — `spec.md §1, Context, abridged` · full text: [spec.md](../spec.md)

> README.md                             setup and test steps verified in a fresh clone (AC-15)
>
> — `sad.md §5, internal decomposition, verbatim` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

— `data-model.md` header, «Mode: brownfield, no schema change … stages zero migrations», abridged · full text: [data-model.md](../data-model.md)

## API contract

Internal — no API surface. (`sad.md` §4: «The feature adds no endpoint, server action, business function, schema or migration»; no `contracts/openapi.yaml` exists for this feature.)

## Acceptance criteria

### AC-15 — happy path

> **Given** a Contributor with a fresh clone of the repository, their own empty PostgreSQL database, and the settings from the example environment file filled in as the README describes
> **When** they follow the README's setup and test steps word for word
> **Then** every command completes successfully and every file or document the README points to exists. The README says what the Contributor must provide (a database and the listed settings), which tests need the database, shows how to run the automated tests and links the testing guide. The README contains no real secret and no shared database address
>
> — `spec.md §5, AC-15, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] List every command and link in `README.md`; fix the setup command and dead links against `package.json` scripts and the files on disk.
- [ ] State what the Contributor must provide (own PostgreSQL, the settings in `.env.example`), which tests need the database (`test:integration`, `test:e2e`), how to run `pnpm test`, and link `tests/README.md`.
- [ ] Make sure `.env.example` has placeholders only (no real secret, no shared DB host).
- [ ] Verify: `git clone` into a temp dir, follow the README verbatim against a throwaway Postgres, record the commands' success in the PR.

## Edge cases

| Case | Behaviour |
|---|---|
| a step needs a setting not in `.env.example` | add it to `.env.example` with a placeholder and to the README list |
| README links a doc page | the target exists in the repo |

## Definition of Done

- [ ] fresh-clone run log attached to the PR, every command exit 0
- [ ] `grep -E 'postgres(ql)?://[^<]*@' README.md` finds no real host
- [ ] every Hard Rule inlined above still holds; no `invoice-integrity` acceptance test regresses
- [ ] lint + vet (`pnpm lint`, `tsc --noEmit`) clean
