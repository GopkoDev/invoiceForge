---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-12"
feature_size: "L"
ticket: "ai-chat-v2"
---

# 0006 — Load the chat's invoice preview through an owner-scoped server action and the shared document model

- **Status:** Accepted
- **Date:** 2026-10-12
- **Deciders:** Dmytro Hopko (owner; decided by the design agent in an autonomous run, open to owner veto)

## Context

The preview panel must show "the same invoice preview the editor shows" (AC-20) within 1.5 s p95. It must say "no longer available" for a deleted draft (AC-21) and "cannot be found" for another Freelancer's invoice (AC-22). Issuing then needs the version the preview showed (ADR-0007). The app has one document model (`lib/invoice-document`, editor-ux ADR-0002) and an HTML `PDFPreviewPanel`, which the invoice list's preview modal already renders outside the editor from a `SerializedInvoice`. The panel lives inside the chat's client island. SAD §4 seed 4.

## Decision drivers

- Spec §6 "Preview open, p95 ≤ 1.5 s from the press to a rendered preview".
- One preview look for the editor, the list and the chat (editor-ux ADR-0002).
- Owner scoping in the service, not in the client (service-layer ADR-0003).

## Considered options

1. **Server action `loadInvoicePreview(cardId)`.**
   - It reads the Freelancer's own Draft card, then its invoice through the owner-scoped `getInvoice`, and returns the serialized invoice with its status and `version`.
   - No such card for this Freelancer → NOT_FOUND ("cannot be found", AC-22).
   - A created card whose invoice link was cleared on delete (`DraftCard.invoiceId` is set to null) → unavailable (AC-21), the same rule `toDraftCardView` already uses.
   - The panel renders `PDFPreviewPanel` with the shared document model.
2. **An RSC route segment** that renders the preview on the server into a parallel `@preview` slot.
3. **Embed the editor's page** (`/invoices/{id}/edit`) in the panel as an iframe in a read-only mode.

## Decision outcome

**Chosen:** Option 1. It is the same pattern as `loadConversationCards` (a small owner-scoped read action called from the island). It reuses the component the list already uses outside the editor and returns the `version` that ADR-0007 needs, all without a navigation. Option 2 brings back route navigation inside the workspace (see ADR-0005). Option 3 loads the whole editor bundle, adds a second document and its own session checks, and exposes editing controls the spec keeps out of the panel (spec §3).

## Consequences

**Positive**
- Preview, list and editor print the same document. A change to the model reaches all three.
- The NOT_FOUND / unavailable split comes from the owner's Draft card row. The panel never learns another Freelancer's invoice exists, because a hard-deleted invoice is told apart by the card, not by the invoice table.

**Negative**
- The action must also return what `PDFPreviewPanel` needs beside the invoice (the sender profile's logo source), so it reads one more owner-scoped row per open.
- Download and Print are not offered in the panel (the spec does not ask for them). Adding them later brings in the browser-only PDF kit (editor-ux ADR-0001).

**Neutral**
- The action's result also feeds the workspace invoice-state store (ADR-0008).

## Links

- Spec: [[../spec.md]] AC-20, AC-21, AC-22; §6 "Preview open"
- SAD: [[../sad.md]] §4, §5, §6 flow 2
- Related ADR: [[0005-give-a-saved-conversation-and-an-open-preview-their-own-addresses-and-keep-a-new-conversation-at-ai]], [[0007-issue-from-the-preview-through-the-invoice-status-service-guarded-by-the-version-the-preview-showed]], [[0008-keep-invoice-states-in-one-workspace-store-fed-by-loads-and-action-results-without-push]]; editor-ux ADR-0002

## As built (review 2026-10-13)

The preview read is scoped to the open Conversation as well as the owner: `loadInvoicePreview(cardId, conversationId)` with the Conversation from `/ai/{id}`. A card of another Conversation, or a missing or invalid `conversationId`, reads NOT_FOUND in the same words as AC-22, and at `/ai` (no Conversation) the panel shows not found without a read (R9-2, R10-1).
