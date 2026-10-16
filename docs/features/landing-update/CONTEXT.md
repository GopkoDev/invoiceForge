---
status: Living
updated_at: "2026-10-16"
---

# Domain Context — landing-update

<!--
Feature-scoped glossary. The repo-root CONTEXT.md holds the project-wide terms (Visitor,
Freelancer, Assistant, Assistant draft, Personal key, …); readers read both and an entry here
wins on conflict. No implementation detail here.
-->

## Glossary

- Landing demo — the scripted animation on the landing page's first screen in which one fixed example sentence is typed into a chat and turns into a sample Assistant draft card; it plays once, stops on the finished card and can be replayed by the Visitor, never looping on its own; its sentence, Customer, lines and amounts are fixed sample content, it is labelled as an example, it never calls a model or reads or stores any data, and the same Visitor always sees the same thing. NOT the in-app AI chat (a Visitor cannot type into it or change what it shows) and NOT the interactive public demo planned in public-redesign (there the Visitor picks prompts; this feature's demo is a temporary bridge that public-redesign replaces).
