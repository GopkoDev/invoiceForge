---
id: T31
title: "Declare the sdd marketplace, ignore local settings and remove the empty route folder"
layer: "docs"
deps: ["T00"]
blocks: []
acs: []
files_hint: [".claude/settings.json", ".gitignore", "app/api/auth/log-logout/"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T31 — Declare the sdd marketplace, ignore local settings and remove the empty route folder

## Place in the sequence

- **Blocked by:** — · **Blocks:** — · **Wave:** wave 4 — the rest (spec §1).
- **Lane:** own lane.

## Why (user story)

> | F4, F5, F6 | §6 repository-hygiene rows |
>
> — `spec.md §1, Traceability table, verbatim` · full text: [spec.md](../spec.md)

Repository hygiene (F4–F6) has no user story; it is carried by the spec §6 repository-hygiene NFR rows quoted below.

## Inlined context

> **Hard rule:** | Repository configuration | **The `sdd` marketplace is declared in `.claude/settings.json` `extraKnownMarketplaces`** (F4). **`.claude/settings.local.json` is git-ignored** (F5). There are no empty route folders (F6) | spec §6 repository-hygiene rows |
>
> — `sad.md §8, row Repository configuration, verbatim` · full text: [sad.md](../sad.md)

Current state (code): `.claude/settings.json` has only `enabledPlugins: { "sdd@sdd": true }`; `.gitignore` ignores `.claude/*.local.md` but not `settings.local.json`; `app/api/auth/log-logout/` exists.

**Fallback:** insufficient or contradicted by the code → read the named file in full ([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) · [openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) · [screens.md](../screens.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### NFR — Repository hygiene (plugin setup, personal settings)

> | Repository hygiene — plugin setup | 0 missing-plugin failures on a fresh clone; the plugin installs from shared repo config alone (F4) | fresh-clone check on a second machine |
> | Repository hygiene — personal settings | 0 personal settings files tracked in the repo; 0 empty route folders (F5, F6) | ignore-rule check + folder scan in review |
>
> — `spec.md §6, NFR rows «Repository hygiene», verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Add `extraKnownMarketplaces.sdd` (source of the sdd plugin marketplace — take it from the owner's `~/.claude` config) — `.claude/settings.json`
- [ ] Add `.claude/settings.local.json` to `.gitignore`; `git rm --cached` it if tracked — `.gitignore`
- [ ] Delete `app/api/auth/log-logout/` (empty) and scan `app/` for other empty folders: `find app -type d -empty`

## Edge cases

| Case | Behaviour |
|---|---|
| Marketplace source unknown | Ask the owner; do not guess a URL |

## Definition of Done

- [ ] `git ls-files .claude` lists no `settings.local.json`; `find app -type d -empty` prints nothing (F5, F6)
- [ ] a fresh clone installs the `sdd` plugin from repo config alone (F4)
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean (`pnpm lint`, `pnpm exec tsc --noEmit`)
- [ ] the `test-plan.md` rows for this task's ACs are written first (red), then pass; the probes above are recorded in the PR description
