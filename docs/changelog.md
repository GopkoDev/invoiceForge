# Changelog

This page shows how the project grows. The newest work is at the top.

## To do

- **MCP OAuth (v2).** Hosted chat assistants (claude.ai, ChatGPT) connect with the Invoice Forge account, not with a Personal key. See the [idea brief](./features/mcp-server/idea-brief.md) §7.

## In progress

Nothing is in progress.

## Shipped

### 2026-10-13 · ai-chat-v2

The AI chat offers each choice it needs as buttons that come from the app's own data, never from the model. A draft can be previewed and issued in the chat under the editor's issuing rules, and only the Freelancer's own press issues it. The AI section fills the screen and keeps the message box in view. The AI can be reached from the navigation and from the dashboard. The chat and MCP can also read sender profiles, bank accounts (last four digits only) and products.
[Spec](./features/ai-chat-v2/spec.md) · [Changelog](./features/ai-chat-v2/_ship/changelog.md) · [OpenAPI](/api/ai-chat-v2)

### 2026-10-12 · ai-assistant (#10)

An AI chat in the app answers questions about the Freelancer's own data and makes a Draft invoice from one sentence. It never guesses a value, and a draft exists only after the Freelancer presses Create. External AI clients can create drafts with a new key that has Draft permission.
[Spec](./features/ai-assistant/spec.md) · [Changelog](./features/ai-assistant/_ship/changelog.md) · [OpenAPI](/api/ai-assistant)

### 2026-10-11 · editor-ux (#9)

The invoice editor is fast and correct. Lists open without the PDF tools, no edit is lost during a save, dates and money look the same everywhere, and the editor works with a screen reader and on a phone.
[Spec](./features/editor-ux/spec.md) · [Changelog](./features/editor-ux/_ship/changelog.md)

### 2026-10-08 · invoice-integrity (#8)

An issued invoice keeps the details that it was sent with. Status changes follow one lifecycle. The server checks every invoice rule.
[Spec](./features/invoice-integrity/spec.md) · [Changelog](./features/invoice-integrity/_ship/changelog.md)

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
