---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-01"
feature_size: "M"
ticket: "service-layer"
---

# 0006 — Isolate business functions in lib/services behind server-only and lint rules

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

Every export of a `'use server'` file is a browser-callable endpoint. A business function that takes an acting Freelancer as an argument would let anyone act as anyone if it lived in such a file. The spec requires two machine-checked properties in CI: 0 uses of session, cookie, header or page-refresh facilities inside the business layer, and 0 business functions browser-callable or imported by browser code (spec §6). We must decide where the layer lives and how that boundary is enforced.

## Decision drivers

- Quality goal 3 / spec §6: request independence and "not reachable from the browser", both checked automatically in CI.
- Spec §6.1: business functions trust their caller, so none may be exposed without an authenticating layer in front.
- §2: one developer, 1–2 sprints, parity first. A tooling migration adds risk without adding behaviour.

## Considered options

1. **`lib/services/` in the same package.** Every file imports `server-only`, so `next build` fails if client code imports it. No `'use server'` anywhere in the folder. ESLint `no-restricted-imports` bans `next/headers`, `next/cache`, `next/navigation`, `@/auth` and `next-auth` inside it. A unit test scans for `'use server'` under `lib/services` and for `lib/services` imports from `'use client'` files.
2. **A separate workspace package `packages/core`.** A pnpm monorepo in which the business layer's `package.json` has no `next` or `next-auth`, so forbidden imports cannot resolve.

## Decision outcome

**Chosen:** Option 1. It gives the same two guarantees through checks that already run on every PR (lint, build, unit), without rebuilding workspaces, tsconfig paths, the Prisma client location, Vitest configs, the Vercel build and CI. That rebuild is about 2–3 extra days and a parity risk, for an MCP process that isn't designed yet.

## Consequences

**Positive**
- A familiar layout (`lib/services/<domain>/`), next to `lib/validations` and `lib/helpers`.
- Violations fail in CI at lint, build or unit time.

**Negative**
- The boundary rests on a lint rule plus a test, not on package resolution. A disabled rule or a new forbidden module needs review to catch it.
- Adds the `server-only` dependency.

**Neutral**
- If the MCP server later runs as its own process, extracting `lib/services` into a package is a move of one folder with its imports already clean.

## Links

- Spec: [[../spec.md]] — §6 Request-independence, Business layer not reachable from the browser; §6.1
- SAD: [[../sad.md]] §5, §8 (Authorization), §10 (QG-3)
- Related ADR: [[0001-pass-a-branded-acting-freelancer-to-every-business-function]]
