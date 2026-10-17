# Changelog — landing-update

## landing-update — the landing page leads with "an invoice from one sentence" and shows it happen

**What:** before signing up, a Visitor now sees what the AI does. The first screen says "Your next invoice is one sentence away" and states under it that the AI prepares a draft the Visitor reviews before anything is sent. On desktop the promise sits on the left and a **Landing demo** on the right; on a phone the demo comes below the account button. The demo looks like a window of the in-app AI chat:

1. An example sentence is typed into the message box and sent.
2. The assistant thinks, answers in one line, and shows a draft proposal card: Customer, one invoice line, the total with its currency, and a **Create draft** button that is never pressed.
3. The demo plays once when half of it is on screen and stops on the finished card. A Replay control plays it again.

Pressing the window or Create leads to sign-in. The demo is marked "Example" in every phase and uses fixed sample content. It calls no model and reads no data.

The demo shows the finished picture without animation in these cases:

- the device asks for reduced motion;
- scripts do not run;
- the animation has not started within 3 seconds of the demo becoming visible.

The finished picture takes the same space as the animation, so nothing on the page moves. A screen reader reads a text summary of the demo instead.

A new **AI section** comes right after the first screen. In plain words it says:

- the AI answers questions about the Freelancer's own invoices and prepares drafts from one sentence;
- it asks when a detail is missing instead of guessing;
- it never issues, sends, edits or deletes an invoice, and never creates a Customer;
- the chat has a daily message limit;
- invoices are not used to train AI models.

The section also says the same works from Claude Desktop, Claude Code and Cursor, and that creating drafts from those tools needs a permission the Freelancer chooses when connecting. It links to the privacy page, has its own account button, and has a new **AI** navigation link on tablet and desktop. The three-figure stats row is gone. The page's search description and link previews now mention getting an invoice draft from one sentence with AI. A signed-in Freelancer still goes straight to the dashboard.

**Why:** the AI chat shipped (ai-assistant, ai-chat-v2), but the landing page still pitched autofill and templates. Visitors never saw the product's strongest difference ([spec](../spec.md) §1–§2). Every claim must be true today, so the landing copy is checked by a test that fails on any claim the AI does not keep. This feature is a temporary bridge until public-redesign replaces the first screen with an interactive demo. Key decisions:

- [ADR-0001](../adr/0001-render-the-landing-demo-card-as-a-standalone-replica-of-the-chat-draft-card.md): the demo card is a standalone replica of the chat's draft card, so the public page does not depend on the chat's code.
- [ADR-0002](../adr/0002-server-render-the-demo-start-frame-and-show-the-finished-still-through-css-only-fallbacks.md): the server renders the demo's start frame, and CSS alone shows the finished picture whenever the animation cannot play.

**How to use:** open `/` while signed out. There is no API, server action or data change.

**Operational notes:**

- Migration: none.
- Feature flag / config: none.
- Rollback: revert the merge commit and redeploy. No stored state depends on it.
- Visual references: the 4 landing baselines (phone 360×640 and desktop 1280×800, light and dark) are Linux-only and were re-taken in `mcr.microsoft.com/playwright:v1.63.0-noble` (see `tests/e2e/README.md`).

**Acceptance criteria delivered:** AC-01 – AC-12. These cover the promise and account button above the fold, the play-once demo with Replay, the demo's fixed content and sign-in links, the finished picture without motion or scripts, no claim beyond what the AI does, the AI section and its own-tools wording, account buttons that lead to sign-in, keyboard and screen-reader access, the signed-in redirect, automated checks with refreshed visual references, and the search description. The demo adds 3.9 KB of the allowed 30 KB of compressed first-load JS.
