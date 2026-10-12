---
id: T25
title: "Replace the single AI navigation item with an \"AI\" group holding AI chat and Connect your AI"
layer: "ui"
deps: []
blocks: ["T31"]
acs: ["AC-28"]
files_hint: ["config/navigation-menu.config.ts", "components/layout/app-sidebar.tsx", "tests/unit/navigation-ai-group.test.ts", "tests/component/app-sidebar-ai-group.test.tsx"]
owner: "Dmytro Hopko"
estimate: "S"
context_budget: "S"
status: "todo"
---

<!-- Self-contained task (sdd tasks template). Every quoted chunk carries a provenance signature;
the source always wins. To the executing agent: work from what is inlined; if a slice is insufficient,
ambiguous or contradicts the code, open the named file and follow it. Do not invent the missing part. -->

# T25 — Replace the single AI navigation item with an "AI" group holding AI chat and Connect your AI

## Place in the sequence

- **Blocked by:** nothing (can start first)
- **Blocks:** T31 — Add e2e tests for preview and issue (two tabs), navigation, dashboard prompt, privacy, MCP reads and accessibility
- **Wave:** 1 (longest dependency chain); linear position T25 of T31 for the sequential in-place run.
- **Lane:** own lane.

## Why (user story)

> **As a** Freelancer
> **I want** an "AI" group in the navigation with the chat and the page for connecting my own AI client
> **So that** both AI entry points sit together like the other groups
>
> — `spec.md §4, US-09, verbatim` · full text: [spec.md](../spec.md)

It puts both AI entry points together in the navigation.

## Inlined context

> `config/navigation-menu.config.ts`: the single main item "AI" is removed. A new `type: 'group'` section with `label: 'AI'` is placed between the main section and "Management", rendered by the existing `AppSidebar` group (the same style as "Management"). Its items are "AI chat" (`/ai`, icon `ai`) and "Connect your AI" (`/settings/assistants`, a plug icon; `implement` adds the icon key if the icon map has none).
>
> — `screens.md §SCR-08, verbatim` · full text: [screens.md](../screens.md)

> | active | The current path is under `/ai` → "AI chat" is active. Under `/settings/assistants` → "Connect your AI" is active (`isActive`, existing matching) |
> | collapsed | … the existing icon-only rendering with a `Tooltip` per item; the group label is hidden as for "Management" |
>
> — `screens.md §SCR-08, states, abridged` · full text: [screens.md](../screens.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [data-model.md](../data-model.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [server-actions.md](../contracts/server-actions.md) ·
[screens.md](../screens.md) · [test-plan.md](../test-plan.md) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-28 — happy path

> **Given** a signed-in Freelancer
> **When** they look at the navigation
> **Then** they see an "AI" group, styled like "Management", holding "AI chat", which opens the AI section, and "Connect your AI", which opens the page where Personal keys are managed; the item of the page they are on is marked active
>
> — `spec.md §5, AC-28, verbatim` · full text: [spec.md](../spec.md)

## Checklist

- [ ] Config change + plug icon key if missing — `config/navigation-menu.config.ts`, `components/layout/app-sidebar.tsx`
- [ ] Unit: the group replaces the single item; hrefs point to `/ai` and `/settings/assistants` — `tests/unit/navigation-ai-group.test.ts`
- [ ] Component: group label styled like Management; active item per path — `tests/component/app-sidebar-ai-group.test.tsx`

## Edge cases

| Case | Behaviour |
|---|---|
| `/ai/{id}` | "AI chat" active |
| Collapsed sidebar | Icons with tooltips, label hidden |

## Definition of Done

- [ ] The navigation config holds an "AI" group between the main section and Management with "AI chat" (/ai) and "Connect your AI" (/settings/assistants), the single AI item is gone, the sidebar renders it like Management and marks the current path's item active.
- [ ] unit + component tests green
- [ ] lint + typecheck clean
- [ ] every Hard Rule inlined above still holds (no model path into an offer or an issue; owner-scoped reads; no full account number)
- [ ] the repo gate passes: unit + component + contract + integration (throwaway Postgres) + lint + typecheck
