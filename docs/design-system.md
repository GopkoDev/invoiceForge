# Design system

Code-only (markdown) design canon: no Figma/Pencil MCP is configured for this project. Component
choices are recorded here as they're built or extended, so a later feature reuses what exists
instead of re-inventing it.

## Registered components

| Component | Location | Contract | Used by |
|---|---|---|---|
| `LoadError` | `components/layout/content-area/load-error.tsx` | A segment `error.tsx` boundary's plain-language "We couldn't load your data" state: an `Empty` (icon + title + description) plus a "Try again" `Button` that calls the caller's `onRetry` (shows a `Spinner` while retrying). Takes an optional `errorDigest`, carried for future support tooling but never rendered — a load failure's raw message must never reach the screen (AC-28). | Any route segment's `error.tsx` (screens.md §SCR-17) |
| `ConfirmationModal` | `components/modals/global-modals/confirmation-modal/confirmation-modal.tsx` | Base `Dialog` (title/description/footer Cancel+Confirm) extended with: a `body` (`ReactNode`) slot for counts, totals and alerts; an `onConfirm` that may return a `Promise` — while it's pending, the confirm button shows a `Spinner` and both footer buttons are disabled, but the dialog itself is **never auto-closed** — closing on success/failure is entirely the caller's decision (call `onClose`/the modal store's `close()` once the promise settles); a synchronous `onConfirm` keeps the old behaviour (closes right after). Also takes `confirmDisabled` (disables Confirm without touching Cancel) and `hideConfirm` (hides Confirm entirely, leaving only Cancel — the caller sets `cancelText` to match, e.g. `'Close'` for a blocked state). | SCR-08 (delete-account), SCR-14 (blocked delete), SCR-15 (totals-changed), plus every simple delete confirmation (products, bank accounts, customers, sender profiles, email change) |

## Notes

- Every caller that passes an async `onConfirm` is responsible for closing the dialog once that
  promise settles (both on success and on failure) — see
  `docs/features/architecture-hardening/_review/review-2026-09-27.md` F-40 for the regression this
  guards against.
