---
id: T20
title: "Add the Connect your AI settings page with setup steps, example prompts and a CopyButton"
layer: "ui"
deps: []
blocks: ["T21", "T22"]
acs: ["AC-01", "AC-02"]
files_hint: ["config/routes.config.ts", "app/(protected)/settings/layout.tsx", "app/(protected)/settings/assistants/page.tsx", "app/(protected)/settings/assistants/loading.tsx", "components/ui/copy-button.tsx", "components/assistants/setup-steps.tsx", "components/assistants/example-prompts.tsx", "tests/component/copy-button.test.tsx", "tests/component/assistants-setup-steps.test.tsx"]
owner: "Dmytro Hopko"
estimate: "M"
context_budget: "M"
status: "todo"
---

<!-- Self-contained task: work from what is inlined here. Every quoted chunk carries a provenance
signature naming where the truth lives; the source always wins. If a slice is insufficient,
ambiguous, or contradicts the code in front of you, open the named file and follow it. Do not
invent the missing part. -->

# T20 — Add the Connect your AI settings page with setup steps, example prompts and a CopyButton

## Place in the sequence

- **Blocked by:** — · **Blocks:** T21 — Build key creation, the one-time reveal, the key lists and revoke confirmation on Connect your AI · T22 — Show the overdue-rule notice and the Connect your AI entry point on the dashboard · **Wave:** 1 — static UI with no backend dependency.
- **Lane:** shares `config/routes.config.ts` with T12 (proxy exception) and `app/(protected)/settings/assistants/page.tsx` with T21 — serialized by `implement`.

## Why (user story)

> **As a** Freelancer
> **I want** to create a named Personal key from a visible "Connect your AI" entry point and get ready-to-paste setup and example prompts for my assistant
> **So that** my assistant can answer questions about my invoices without me opening the app
>
> — `spec.md §4, US-01, verbatim` · full text: [spec.md](../spec.md)

This task builds the page shell, its Settings entry, the setup steps and the example prompts; the key list and create form follow in T21.

## Inlined context

> New page at `/settings/assistants`, a Settings nav item "Connect your AI" next to Profile and Privacy (AC-01). Sections top to bottom: create form → one-time key reveal (only after a create) → setup steps → example prompts → active keys → revoked keys.
> | loading | Page request in flight: new `loading.tsx` with a form skeleton and three row skeletons | `Skeleton` |
>
> — `screens.md §SCR-03, header + loading state, verbatim` · full text: [screens.md](../screens.md)

> **Setup steps** (one `Tabs` panel per launch client, sad.md §11; each snippet in a monospace block with a `CopyButton`; `{origin}` is the app origin, `YOUR_KEY` is replaced while the reveal is visible). Each panel's first line says the key is kept in a user-level, private setting and not in a project file (AC-02).
> - **Claude Code:** run in a terminal: `claude mcp add --transport http --scope user invoiceflow {origin}/api/mcp --header "Authorization: Bearer YOUR_KEY"`
> - **Cursor:** add to the global `~/.cursor/mcp.json` (not the project's `.cursor/mcp.json`): `{ "mcpServers": { "invoiceflow": { "url": "{origin}/api/mcp", "headers": { "Authorization": "Bearer YOUR_KEY" } } } }`
> - **Claude Desktop:** needs Node.js. Add to `claude_desktop_config.json` (Settings → Developer → Edit config), then restart Claude Desktop: `{ "mcpServers": { "invoiceflow": { "command": "npx", "args": ["mcp-remote", "{origin}/api/mcp", "--header", "Authorization:${AUTH}"], "env": { "AUTH": "Bearer YOUR_KEY" } } } }`
>
> **Example prompts** (three, each with a `CopyButton`):
> 1. "Who owes me money right now, and how many days overdue is each invoice?"
> 2. "Which payments am I expecting this month?"
> 3. "Give me this month's totals: invoiced, paid and overdue."
>
> — `screens.md §SCR-03, Setup steps + Example prompts, abridged` · full text: [screens.md](../screens.md)

> Page intro copy: "Connect your AI" / "Let Claude or Cursor read your invoices and answer money questions. Keys are read-only: an assistant can't change or send anything." Setup heading "Set up your assistant", panel line "Keep the key in your user settings, never in a project file.", prompts heading "Try asking". Phone: the snippet block scrolls sideways inside itself.
>
> — `screens.md §SCR-03, wireframe, abridged` · full text: [screens.md](../screens.md)

> | `CopyButton` | The repo has no clipboard primitive … Contract: an icon `Button` (`size="icon"`, `aria-label` "Copy {what}") that writes its `value` prop with `navigator.clipboard.writeText`. On success the icon swaps to a check and the label to "Copied" for 2 s, announced via `aria-live="polite"`. If the clipboard is unavailable or refused: `toast.error` "Couldn't copy. Select the text and copy it by hand." It never logs or sends `value` anywhere | pending |
>
> — `screens.md §New components, CopyButton, abridged` · full text: [screens.md](../screens.md)

> **Hard rule (UI architecture):** composed from the existing shadcn/ui primitives and tokens (`docs/design-system.md`); the connect page follows the Settings sub-page precedent. / **Posture:** responsive-both. Every state works at desktop and phone widths.
>
> — `sad.md §4, UI architecture` + `screens.md §Source, Posture, abridged` · full text: [sad.md](../sad.md)

**Fallback:** insufficient or contradicted by the code → read the named file in full
([spec.md](../spec.md) · [sad.md](../sad.md) · [screens.md](../screens.md) ·
[openapi.yaml](../contracts/openapi.yaml) · [adr/](../adr/)) and follow it. Do not guess.

## Data delta

No DB changes.

## API contract

Internal — no API surface. (The snippets point at `{origin}/api/mcp`, served by T12; the key list and create action arrive in T21.)

## Acceptance criteria

### AC-01 — happy path

> **Given** a signed-in Freelancer with no Personal keys
> **When** they open the dashboard or the settings
> **Then** they see a "Connect your AI" entry point that leads to the connect page. On the dashboard it stays visible until any of their keys has been used at least once, and it does not come back after that, even if every key is later revoked. A key counts as used when any call presented with it passes the key check
>
> — `spec.md §5, AC-01, verbatim` · full text: [spec.md](../spec.md)

(This task covers the Settings entry point; the dashboard entry point is T22.)

### AC-02 — happy path

> **Given** a Freelancer on the connect page
> **When** they create a Personal key named "Laptop assistant"
> **Then** the full key is shown exactly once, with a copy action and a warning that it will not be shown again. The page also shows setup steps for each supported assistant, which keep the key in a private setting rather than in a project file, and three example prompts. After leaving the page, the key is shown only by its name, creation date and last four characters
>
> — `spec.md §5, AC-02, verbatim` · full text: [spec.md](../spec.md)

(This task covers the setup steps, the example prompts and the copy action; the create and reveal are T21.)

## Checklist

- [ ] Add `settingsAssistants: '/settings/assistants'` to `protectedRoutes` in `config/routes.config.ts`.
- [ ] Add `{ name: 'Connect your AI', href: protectedRoutes.settingsAssistants }` to `settingsNavItems` in `app/(protected)/settings/layout.tsx`.
- [ ] Create `components/ui/copy-button.tsx` per the CopyButton contract.
- [ ] Create `components/assistants/setup-steps.tsx` (`Tabs` per client, `origin` + optional `fullKey` props, `YOUR_KEY` placeholder) and `components/assistants/example-prompts.tsx`.
- [ ] Create `app/(protected)/settings/assistants/page.tsx` (intro + setup steps + prompts; slots for T21 sections) and `loading.tsx`.
- [ ] Component tests `tests/component/copy-button.test.tsx`, `tests/component/assistants-setup-steps.test.tsx`.
- [ ] Register `CopyButton` in `docs/design-system.md`.

## Edge cases

| Case | Behaviour |
|---|---|
| `navigator.clipboard` missing or `writeText` rejects | `toast.error` "Couldn't copy. Select the text and copy it by hand."; icon stays |
| Two clicks within 2 s | "Copied" stays; one more write |
| `fullKey` prop given | every snippet reads `Bearer <fullKey>` instead of `Bearer YOUR_KEY` |
| Phone width | nav scrolls sideways; snippet block scrolls inside itself |
| Copied value | never logged or sent |

## Definition of Done

- [ ] Component tests show the Settings nav item Connect your AI linking to /settings/assistants, the three client tabs with snippets keeping the key in a user-level setting and a YOUR_KEY placeholder replaceable by a key prop, the three example prompts, and CopyButton's copied and clipboard-unavailable states; the page has a loading skeleton.
- [ ] `CopyButton` registered in `docs/design-system.md`
- [ ] every Hard Rule inlined above still holds
- [ ] lint + vet clean
