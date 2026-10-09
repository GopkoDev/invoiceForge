# How to read these docs

A short reference: what each feature folder holds, in which order to read it, and what the abbreviations and IDs mean.

## Where to start

- [Description](/description): what the product does and who uses it.
- [Changelog](/changelog): which features are shipped, in progress or planned.
- [Architecture map](/architecture-map): how the code is laid out today.
- [Design system](/design-system): the UI canon (tokens, components, layout posture).

## One feature folder

Each feature lives in `features/<slug>/`. Read the files top to bottom; each one is derived from the ones above it.

| File | What it answers |
|---|---|
| `brief.md` / `idea-brief.md` | Why the feature exists: the raw problem and findings before the spec |
| `spec.md` | **What** to build: goals, user stories, acceptance criteria, NFRs, open questions |
| `ux-flows.md` | How a user moves through the screens (one flow per user story) |
| `sad.md` | **How** it is built: the architecture document (Arc42, 12 sections) |
| `adr/NNNN-*.md` | One significant decision each, with the alternatives it rejected |
| `data-model.md`, `migrations/` | Schema changes and the staged forward / rollback SQL |
| `contracts/` | The interface: `openapi.yaml` (rendered under **API**), server actions, sync report |
| `screens.md` | Every screen in every state (default, loading, empty, error, …) |
| `test-plan.md` | Which test proves which acceptance criterion, and at what level |
| `tasks/`, `tasks.json` | The work broken into ≤1-day tasks with a Definition of Done |
| `_review/` | Code-review rounds (`review-<date>-r2.md` is the second round that day) |
| `_audit/` | Data-model audits |
| `_fixes/` | One record per bug fixed after the feature shipped |
| `_ship/`, `release.md`, `ship-notes.md` | PR body, manual checklist, release runbook |
| `.size`, `.route` | Feature size (XS–XL) and pipeline route (quick / standard / full) |

## Abbreviations

| Term | Meaning |
|---|---|
| **SDD** | Spec-driven development: the pipeline that produces these files (spec → design → tasks → implement → review → ship) |
| **AC** | Acceptance criterion: a testable "done" condition in `spec.md` §5 |
| **US** | User story, `spec.md` §4 |
| **NFR** | Non-functional requirement (speed, security, accessibility), `spec.md` §6 |
| **KPI** | Metric that shows the feature worked, `spec.md` §7 |
| **OQ** | Open question, `spec.md` §8: `[ ]` open with a "Default now", `[x]` resolved |
| **SAD** | Software Architecture Document (`sad.md`) |
| **Arc42** | The 12-section template the SAD follows |
| **C4** | Context / container diagrams in SAD §3 and §5 |
| **ADR** | Architecture Decision Record |
| **QG** | Quality goal, SAD §10 |
| **SCR** | Screen ID from `ux-flows.md` / `screens.md` |
| **DoD** | Definition of Done of a task |
| **MCP** | Model Context Protocol: how an Assistant (an AI program) reads a Freelancer's data |
| **CSP / HSTS** | Browser security headers (content policy / force HTTPS) |
| **SSRF** | Server-side request forgery: the server tricked into fetching an internal URL |
| **RSC / SSR** | React Server Components / server-side rendering |
| **p95** | 95th-percentile latency: 95 % of requests are faster than this |
| **e2e** | End-to-end test through a real browser |
| **RED / GREEN** | TDD steps: a failing test first, then the code that passes it |

Domain words (Freelancer, Customer, Assistant, Visitor, issued invoice, …) are defined in `CONTEXT.md` at the repo root.

## IDs

| ID | Where it is defined | Example |
|---|---|---|
| `AC-NN` | `spec.md` §5 of the same feature. A letter suffix (`AC-23b`) is a split added later | AC-05 |
| `US-NN` | `spec.md` §4 | US-02 |
| `SCR-NN` | `ux-flows.md` screen inventory | SCR-07 |
| `ADR-NNNN` | `adr/` of the same feature (numbering restarts per feature) | ADR-0009 |
| `TNN` | `tasks/` / `tasks.json` | T35 |
| `QG-N` | SAD §10 | QG-1 |
| `OQ-N` | `spec.md` §8, or the open questions of `data-model.md` | OQ-2 |
| `D-N` | A drift finding in a contract sync report (`contracts/api-sync-report.md`) | D-3 |
| `TD-N` | A technical decision recorded in the SAD or data model | TD-1 |
| `U#`, `D#` | A finding in a feature brief | U2 |
| `F-NN`, `G-NN`, `H-NN`, `N-NN`, `R-NN`, … | A review finding. The letter only tells review rounds apart; look the ID up in that feature's `_review/` | review-2026-10-05-r2 H-01 |

IDs are local to their feature: `AC-05` in two features are two different criteria. When a document points to another feature, it names the folder (`mcp-server` spec §8).

## Reading conventions

- **§N** is a section of the document named next to it (`spec §5`, `SAD §6`).
- **"Default now"** in an open question is what the code does until the owner decides.
- **"Accepted debt"** / **"accepted risk"** (SAD §11) is known and kept on purpose, not a forgotten bug.
- **"added-by-fix"** marks an acceptance criterion added when a bug showed a gap in the spec.
