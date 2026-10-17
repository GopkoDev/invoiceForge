---
status: Draft
owner: "Dmytro Hopko"
updated_at: "2026-10-16"
depth: "easy"
---

# Idea brief — landing-update

## 1. Raw idea

До проекту додався новий функціонал, а саме мсп та аі агент, треба оновити головну сторінку(лендінг) цією інформацією

## 2. Problem

The product now has an AI assistant that answers from the user's own data and drafts an invoice from one sentence, plus an MCP integration. The public landing page says nothing about either, so first-time visitors don't see the product's strongest differentiator and get no reason to sign up because of it.

## 3. Users

New visitors who reach the landing page and haven't signed up: freelancers and small businesses that issue invoices. Success means more of them sign up. Existing account holders and developer-first MCP seekers are not the main audience of this change.

## 4. Why now

The AI assistant and AI chat v2 just shipped to main, and the landing page is behind the product. There's no outside deadline. The trigger is that the strongest feature is out and invisible to visitors.

## 5. Out of scope

- A full redesign or repositioning of the public pages — that is the separate "public-redesign" feature.
- A live, no-signup try of the AI on the landing page — it brings paid anonymous model calls, abuse, rate limits and privacy concerns; it's a feature of its own.
- Announcing to existing users inside the app — this change targets visitors, not account holders.
- Developer-depth MCP material (config snippets, setup guides) in the hero — MCP is a secondary argument with its own section.

## 6. Risks

- Assumes a scripted demo is believable; false if the animation looks fake or generic and visitors treat it as marketing filler rather than proof.
- Assumes "AI" in the hero helps conversion; false if the audience is wary of AI touching their financial documents — the copy has to stay concrete ("an invoice from one sentence"), not hype.
- MCP is jargon for the target audience; if the section isn't written in plain language it's noise, or it scares people off.
- Rewriting the hero can break the current visual layout, and the landing page's visual baselines will need to be updated.

## 7. Recommendation

Rewrite the hero around "an invoice from one sentence", backed by an animated, scripted demo where a sentence turns into an invoice draft — no live model calls. Add one section below that covers the AI assistant (answers from your data) and MCP (use Invoice Forge from your AI tools) in plain, outcome-first language. The rest of the landing page stays as it is.

## 8. Open questions

- Which exact sentence and resulting invoice the demo shows, and whether it must match real assistant output — owner: Dmytro Hopko.
- How to measure "more sign-ups" (baseline before the change, what counts as the conversion) — owner: Dmytro Hopko.
- Whether the MCP section links to the docs site for those who want details — owner: Dmytro Hopko.
- How this change lines up with the separate public-redesign so it isn't thrown away — owner: Dmytro Hopko.
