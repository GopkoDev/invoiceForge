---
slug: ai-chat-v2
date: 2026-10-14
triage: gap
acs: [AC-18]
commit: see SDD-Fix 2026-10-14-start-panel-styling
recurrence_of: none
---

# Fix: the start panel's accent and message box did not match the site's highlight style

## Symptom

Owner, 2026-10-14: on a new Conversation (SCR-02 start panel) the greeting's accent words ("your invoices today?" / "an invoice.") used a muted `--chart-*` gradient unlike the rest of the site, and the message box was a plain card. Wanted: the accent styled like the "No Surprises" highlight of the Terms page title, and the message box wrapped in the neon border of the Terms page's "1. What Invoice Forge Is (And Isn't)" card, only until the first message.

## Root cause

A presentation choice, not a defect: screens.md SCR-02 specified the `--chart-3`→`--chart-5` text gradient (`.ai-greeting-accent`) and a plain PromptInput card. No AC said the start panel should share the marketing pages' highlight style — a **gap**.

## The pinning test

`tests/component/ai-start-panel.test.tsx`, describe "StartPanel - styling (fix 2026-10-14)": the accent carries the Terms highlight classes (default and draft copy) and not `ai-greeting-accent`; the start composer sits in `[data-slot="start-composer-neon"]` (`rounded-2xl`, a gradient layer with `animate-gradient-shift`) around the PromptInput card; a used-up start panel has no neon wrapper. RED: `expect(element).toHaveClass("animate-gradient-shift")` (accent ×2) and `expected null not to be null` (no neon wrapper).

## Fix

- `components/ai/start-panel.tsx`: the accent span uses the `legal-hero.tsx` highlight classes; the start composer is wrapped in `NeonBorderWrapper variant="always"` with `rounded-2xl` (the card's own border made transparent inside it, so there is one edge). The docked composer after the first message is a different element (`composer-dock`) and stays plain.
- `components/ui/neon-border-wrapper.tsx`: optional `data-slot` pass-through.
- `app/globals.css`: the unused `.ai-greeting-accent` block removed; `.animate-gradient-shift` stops moving under `prefers-reduced-motion: reduce` (site-wide; the gradient itself stays).

## Spec patch

(c) gap, owner-decided: AC-18 got an "Amended 2026-10-14" presentation note (`added-by-fix`); screens.md SCR-02 «Greeting» describes the new accent and the start composer's neon border.

## Follow-ups

- The landing/legal highlights have no `forced-colors` fallback (the removed `.ai-greeting-accent` had one); browsers in forced-colors mode drop `background-clip:text` gradients and show system text colour, so text stays readable.

## Gate (2026-10-14)

| Gate | Result |
|---|---|
| Component tests (`tests/component`) | 121 files, 1093 passed |
| Lint / tsc | 0 errors (4 warnings outside the feature) / clean |
| E2E (Linux Chromium of `playwright:v1.63.0-noble`, `PW_SNAPSHOT_PLATFORM=linux`): `ai-chat-v2-chat`, `ai-assistant-flows`, `accessibility` | 25 passed; baselines `ai-v2-new-conversation` and `ai-section-default` retaken on purpose (the start panel's new accent and neon border) |
