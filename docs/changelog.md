# Changelog

This page shows how the project grows. The newest work is at the top.

## To do

- **MCP OAuth (v2).** Hosted chat assistants (claude.ai, ChatGPT) connect with the Invoice Forge account, not with a Personal key. See the [idea brief](./features/mcp-server/idea-brief.md) §7.
- **MCP drafts (v1.1).** An Assistant can create and change draft invoices. This work starts after invoice-integrity. See the [idea brief](./features/mcp-server/idea-brief.md) §7.
- **editor-ux.** A faster and safer invoice editor: no lost edits, correct dates near midnight, screen reader support and a stable phone layout. See the [brief](./features/editor-ux/brief.md).

## In progress

- **invoice-integrity.** An issued invoice keeps the details that it was sent with. Status changes follow one lifecycle. The server checks currencies and totals. See the [brief](./features/invoice-integrity/brief.md).

## Shipped

### 2026-10-07 · mcp-server (#6)

A Freelancer connects their own AI assistant with a Personal key. The assistant answers money questions. The numbers are the same as on the dashboard.
[Spec](./features/mcp-server/spec.md) · [Changelog](./features/mcp-server/_ship/changelog.md) · [OpenAPI](/api/mcp-server)

### 2026-10-06 · security-patch (#5)

The pre-launch security holes are closed. The app is safe to share publicly.
[Spec](./features/security-patch/spec.md) · [Changelog](./features/security-patch/changelog.md) · [OpenAPI](/api/security-patch)

### 2026-10-02 · service-layer (#4)

All business rules are in one layer that does not need a browser session. Every caller uses this layer.
[Spec](./features/service-layer/spec.md) · [Changelog](./features/service-layer/_ship/changelog.md)

### 2026-09-30 · architecture-hardening (#2, #3)

The server applies its own rules and does not trust the browser. This change closes the findings of the 2026-09-26 review.
[Spec](./features/architecture-hardening/spec.md) · [Changelog](./features/architecture-hardening/_ship/changelog.md) · [OpenAPI](/api/architecture-hardening)

### 2025-12-30 – 2026-01-24 · First version

The first version of the app. It has sign-in, sender profiles with bank accounts, customers, products, custom prices, the invoice editor with PDF export, the dashboard, legal pages and the cookie banner.
