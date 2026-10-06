---
slug: mcp-server
date: 2026-10-07
triage: regression
acs: []
commit: pending
recurrence_of: none
---

# Fix: the revoke confirmation renders inline instead of through the modal store

## Symptom

Clicking Revoke on Settings → Connect your AI, expected the confirmation to open through `store/use-modal-store.ts` and render in the settings layout's `SettingsModalContainer`, like every other confirmation in the app. Got a `<ConfirmationModal>` rendered inline by `components/assistants/assistant-keys.tsx`, with its own open/target state. The user sees no difference; the defect is in the code structure. It has been present since T21.

## Root cause

`AssistantKeys` kept `revokeTarget` and `lastTarget` in local state and rendered the dialog itself. That breaks the convention in `docs/architecture-map.md` ("modals go through `store/use-modal-store.ts`"). The settings layout already mounts `SettingsModalContainer`, which renders `confirmationModal` from the store, so the page had two ways to show a confirmation. The T21 tests rendered `AssistantKeys` alone, so nothing pinned where the dialog comes from.

## The pinning test

`tests/component/assistants-keys.test.tsx` → `SCR-04 revoke confirmation › opens the confirmation through the modal store, not inline` (component). RED before the fix:

> AssertionError: expected undefined to be 'Revoke "Laptop assistant"?' // Object.is equality

GREEN after it. The other revoke tests now render `AssistantKeys` next to `SettingsModalContainer`, as the settings layout does, and all of them pass unchanged. That covers the copy, cancel, pending, focus to the Active keys heading, title kept while closing, NOT_FOUND, UNAUTHORIZED and a rejected call.

## Spec patch

None. No AC in `spec.md` covers how a dialog is mounted: AC-06 and SCR-04 describe the behaviour, which is unchanged and re-verified by the existing revoke tests. The rule this fix restores is the architecture convention in `docs/architecture-map.md`.

## Follow-ups

- `components/invoice-editor/invoice-editor.tsx:109` also renders `<ConfirmationModal>` inline. It predates this feature, so this fix leaves it alone. Check whether it should move to the store as well.
- The e2e key-flow spec (`tests/e2e`) was not re-run here. It exercises revoke through the real page and runs in CI on the production build.
