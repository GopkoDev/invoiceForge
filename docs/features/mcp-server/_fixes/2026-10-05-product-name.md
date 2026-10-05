---
slug: mcp-server
date: 2026-10-05
triage: spec-bug
acs: [AC-07, AC-19]
commit: <filled after the fix commit lands>
recurrence_of: none
---

# Fix: the product was called "invoiceFlow" instead of "Invoice Forge"

## Symptom

A Freelancer or an Assistant using mcp-server saw the product called **invoiceFlow**. The product is **Invoice Forge** (`config/site.config.ts`, the landing page, the legal pages). The old name appeared in these places:

- the dashboard's "Connect your AI" entry point ("…your invoiceFlow data");
- every MCP refusal and failure message, including the AC-07 invalid-key message and the limit and server-failure messages;
- the server instructions and the tool descriptions;
- the AC-19 invoice link description;
- the MCP server name in the setup snippets for Claude Code, Cursor and Claude Desktop, which became the user's tool prefix `mcp__invoiceflow__…`;
- the `WWW-Authenticate` realm.

It affects every user of mcp-server and has been there since the spec was written (2440dd6). It was found before merge.

The same name was also used in the docs of mcp-server and security-patch, in `idea-brief.md` (as "invoceFlow", the repo folder's typo), in `architecture-map.md`, and in a few internal identifiers:

- the proxy header `x-invoiceflow-request-path`;
- the test database and runtime directory names.

## Root cause

The working name came from the repo folder (`invoceFlow`). It reached the idea brief, and from there `CONTEXT.md`, whose heading read "Domain Context — invoiceFlow (Invoice Forge)". The glossary is the canonical source of names for specify, design and api. So every downstream artifact, then every string implemented from them, used "invoiceFlow" as the product name.

No test checked the product name, and review read the strings against the spec, which had the same wrong name.

## The pinning test

`tests/unit/product-name.test.ts` (unit) scans the code, the tests, `CONTEXT.md`, `README.md` and `docs/` for any spelling of the old name: `/invoi?ce[\s_-]?flow/i`. The `_fixes/` records are excluded because they quote it.

RED before the fix:

```
AssertionError: expected [ 'app/api/mcp/route.ts:61', …(28) ] to deeply equal []
```

It failed on 29 lines across code and tests. GREEN after the fix: no offenders.

## Spec patch

The spec is the root cause: it calls the product "invoiceFlow" throughout. The owner asked for the name to be replaced everywhere in the project (2026-10-05), so the spec now reads "Invoice Forge" everywhere, including:

- **AC-07:** the refusal "tells the Assistant to ask the Freelancer for a valid key". The message now names Invoice Forge.
- **AC-19:** "a link that opens the invoice in Invoice Forge".

No AC changes its meaning. The same replacement was applied to `CONTEXT.md` (heading), `docs/idea-brief.md`, `docs/architecture-map.md`, and every mcp-server and security-patch artifact (sad, ADRs, contracts, tasks, screens, ux-flows, test plan, reviews, changelogs, PR body).

**Machine identifiers.** Claude Code accepts only letters, digits, `-` and `_` in an MCP server name, so the space in "Invoice Forge" can't be used there. These are the new values:

| Where | Before | After |
|---|---|---|
| MCP `serverInfo` | `name: invoiceflow` | `name: invoice-forge`, `title: Invoice Forge` |
| Setup snippets (all three clients) | `invoiceflow` | `invoice-forge` |
| `WWW-Authenticate` | `realm="invoiceflow"` | `realm="Invoice Forge"` |
| Internal proxy header | `x-invoiceflow-request-path` | `x-invoice-forge-request-path` |
| Test database names | `invoceflow_test`, `invoceflow_e2e` | `invoice_forge_test`, `invoice_forge_e2e` |
| e2e runtime directory | `invoceflow-e2e` | `invoice-forge-e2e` |

The `openapi.yaml` serverInfo, realm and messages match the code.

## Follow-ups

- The repo folder is still named `invoceFlow` (local only; the GitHub repo is `invoiceForge`). Rename it locally if you want. The Claude Code memory path for this project is derived from the folder name, so it would start empty after a rename.
- The internal header rename belongs to security-patch (PR #5) but lands with this branch, which is stacked on it. Nothing outside the app reads that header.
