# Tracker — mcp-server

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T01 | [Promote the five staged migrations and extend the test support for keys, usage and time zone](./t01-promote-migrations-and-test-support.md) | migration | Dmytro Hopko | M | — | done |
| T02 | [Add the shared overdue rule module with its SQL, Prisma and TypeScript forms](./t02-shared-overdue-rule.md) | domain | Dmytro Hopko | M | — | done |
| T03 | [Generate, checksum and digest ifk_ Personal keys](./t03-personal-key-format.md) | domain | Dmytro Hopko | S | — | done |
| T04 | [Read the Freelancer time zone from the account in both ActingFreelancer factories and save it from settings](./t04-account-time-zone.md) | app | Dmytro Hopko | M | T01 | done |
| T05 | [Add the Time zone card to Profile settings](./t05-time-zone-settings-card.md) | ui | Dmytro Hopko | S | T04 | todo |
| T06 | [Apply the shared overdue rule to every dashboard figure and show tabs for issued-invoice currencies](./t06-dashboard-overdue-rule-and-currency-tabs.md) | app | Dmytro Hopko | M | T02 | done |
| T07 | [Return the derived status from every invoice read and filter by the shared rule](./t07-derived-invoice-status.md) | app | Dmytro Hopko | M | T02 | done |
| T08 | [Show the derived overdue status on the invoice list, customer page, invoice page and recent invoices](./t08-derived-overdue-on-screens.md) | ui | Dmytro Hopko | S | T06, T07 | done |
| T09 | [Create, list and revoke Personal keys through the business layer and server actions](./t09-personal-key-management.md) | app | Dmytro Hopko | M | T01, T03 | done |
| T10 | [Add the per-key and per-source MCP limit scopes that fail closed](./t10-mcp-limit-scopes.md) | infra | Dmytro Hopko | S | T01 | done |
| T11 | [Authenticate a presented Personal key and record its last use and weekly usage](./t11-key-authentication-and-usage.md) | app | Dmytro Hopko | M | T01, T03, T04 | todo |
| T12 | [Serve POST /api/mcp behind its single proxy exception with the source-limit, key-check and key-limit pipeline](./t12-mcp-endpoint-and-request-pipeline.md) | ports | Dmytro Hopko | M | T10, T11 | todo |
| T13 | [Shape MCP answers, register read-only tools and count substantive calls](./t13-mcp-answers-and-tool-registry.md) | ports | Dmytro Hopko | M | T12 | todo |
| T14 | [Page overdue invoices and Debtors strictly with totals over every match](./t14-strict-paging-overdue-and-debtors.md) | app | Dmytro Hopko | M | T06 | todo |
| T15 | [Page Expected payments by period and compute summary figures for every issued-invoice currency](./t15-expected-payments-and-summary-reads.md) | app | Dmytro Hopko | M | T14 | todo |
| T16 | [Match Customers by current and invoice-copied names and search issued invoices for an Assistant](./t16-customer-match-and-invoice-search.md) | app | Dmytro Hopko | M | T07, T14 | todo |
| T17 | [Find one invoice by id or by number with an optional sender profile name](./t17-find-invoice-by-reference.md) | app | Dmytro Hopko | M | T16 | todo |
| T18 | [Expose the overdue, Debtors, Expected payments and summary figures tools](./t18-aggregate-tools.md) | ports | Dmytro Hopko | M | T13, T14, T15 | todo |
| T19 | [Expose the customers, invoice search and one-invoice tools](./t19-lookup-tools.md) | ports | Dmytro Hopko | M | T13, T16, T17 | todo |
| T20 | [Add the Connect your AI settings page with setup steps, example prompts and a CopyButton](./t20-connect-page-shell-and-setup.md) | ui | Dmytro Hopko | M | — | done |
| T21 | [Build key creation, the one-time reveal, the key lists and revoke confirmation on Connect your AI](./t21-key-create-reveal-and-revoke-ui.md) | ui | Dmytro Hopko | M | T09, T20 | todo |
| T22 | [Show the overdue-rule notice and the Connect your AI entry point on the dashboard](./t22-dashboard-notice-and-entry-point.md) | ui | Dmytro Hopko | M | T01, T09, T20 | todo |
| T23 | [Add Personal keys, weekly usage and the time zone to the data export and verify deletion removes them](./t23-export-and-account-deletion.md) | app | Dmytro Hopko | S | T01 | done |
| T24 | [Prove Assistant-dashboard parity, day boundaries, tenant isolation and the latency budget end to end](./t24-parity-boundary-isolation-and-scale.md) | tests | Dmytro Hopko | M | T18, T19 | todo |

**Total:** 24 tasks, ~21.5 person-days (S = ½ day, M = 1 day).
