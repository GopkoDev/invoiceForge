---
id: T2
title: "Upgrade Prisma to the latest 7.x and remove @prisma/extension-accelerate"
layer: "wiring"
deps: ["T1"]
blocks: ["T3", "T20"]
acs: ["AC-27"]
files_hint: ["package.json", "pnpm-lock.yaml"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "done"
---

# T2 — Upgrade Prisma to the latest 7.x and remove @prisma/extension-accelerate

## Place in the sequence

- **Blocked by:** T1 — Upgrade Next.js, next-auth and nodemailer in one change · **Blocks:** T3 — Promote the LimitEvent migration, T20 — Gate the release · **Wave:** 2 — a separate commit right after T1 so a regression bisects to one of the two.
- **Lane:** shares `package.json` / `pnpm-lock.yaml` with T1 and T10 — serialized.

## Why (user story)

> **As a** Freelancer
> **I want** the app to run on framework, sign-in and mail components with no known critical or high advisories
> **So that** my account and invoices are not exposed to published exploits
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task delivers the dependency-hygiene part of US-01: the database toolkit on its latest 7.x and the unused acceleration extension gone.

## Inlined context

> **Dependency hygiene is in scope.** The brief's "include if cheap" items ship with this feature: the database toolkit is upgraded to its latest 7.x release and the unused database-acceleration extension is removed (AC-27).
>
> — `spec.md §1, decisions, verbatim` · full text: [spec.md](../spec.md)

> Prisma 7.2 → **latest 7.x** (`@prisma/client`, `prisma`, `@prisma/adapter-pg`) over Neon PostgreSQL. The schema is split under `prisma/schema/` and migrated with `prisma migrate`. `@prisma/extension-accelerate` is removed (AC-27).
>
> — `sad.md §2, Technical constraints, verbatim` · full text: [sad.md](../sad.md)

> **Hard rule:** […] with the Prisma upgrade and accelerate removal as a separate following commit (AC-27), and run the full unit + integration suite […] before any hardening step builds on it
>
> — `sad.md §11, risk row 1 (bisect), abridged` · full text: [sad.md](../sad.md)

At breakdown time `@prisma/extension-accelerate` appears only in `package.json` (no import in app code) — re-check with a grep before removing.

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-27 — happy path

> **Given** the release candidate of the app
> **When** its dependencies are inspected
> **Then** the database toolkit is on its latest 7.x release, the unused database-acceleration extension is no longer a dependency, and every advisory that remains comes only from development tooling and is listed in the ship notes (AC-01)
>
> — `spec.md §5, AC-27, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Grep the repo (excluding `node_modules`) for `extension-accelerate` / `withAccelerate`; expect only `package.json`.
- [ ] Remove `@prisma/extension-accelerate`; bump `@prisma/client`, `prisma`, `@prisma/adapter-pg` to the latest 7.x — `package.json`, `pnpm-lock.yaml`.
- [ ] `pnpm install` (runs `prisma generate`); confirm `prisma migrate diff --from-config-datasource --to-schema prisma/schema` stays empty against the **dev** DB (check the host in `.env` first; never `.env.prod`).
- [ ] Run lint, typecheck, `pnpm test:unit`, `pnpm test:integration`.
- [ ] Commit separately from T1.

## Edge cases

| Case | Behaviour |
|---|---|
| A later 7.x changes the generated client or adapter API | Fix call sites in this commit; behaviour unchanged |
| The latest 7.x is not newer than the installed one | Record the version as already latest; still remove accelerate |

## Definition of Done

- [ ] `@prisma/client`, `prisma`, `@prisma/adapter-pg` on the latest 7.x; `@prisma/extension-accelerate` absent from `package.json` and the lockfile (AC-27).
- [ ] `prisma generate` succeeds; migrate diff against dev is empty.
- [ ] Separate commit after T1, with the suite green between them.
- [ ] every Hard Rule inlined above still holds
- [ ] lint + typecheck + unit + integration clean
