---
status: Accepted
owner: "Dmytro Hopko"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-04"
feature_size: "M"
ticket: "mcp-server"
---

# 0004 — Store Personal keys as SHA-256 digests of prefixed random secrets

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Dmytro Hopko (Architect), with Claude during the design walk

## Context

A Personal key is a new credential to Confidential data (spec §6.1). It is shown once, never stored readably, checked on every call (up to 60 per minute per key), and must be recognisable to secret scanners. Revocation must take effect on the first call after it (0 s grace), so the check cannot rely on a cache.

## Decision drivers

- Spec §6.1: the full key is shown once and never stored in readable form; recognisable format for secret scanners.
- Spec §6 NFR: p95 ≤ 800 ms per call; revocation 0 s grace.
- AC-07: a revoked, unknown, malformed or orphaned key is refused without revealing whether it existed.

## Considered options

1. **SHA-256 digest** — key = `ifk_` + 32 random bytes (base62) + a checksum suffix; store `sha256(key)` under a unique index plus the last four characters; look up by digest.
2. **HMAC-SHA-256 with a server-side pepper** — the same, but the stored value is `HMAC(pepper, key)` with the pepper in an environment setting.
3. **Slow password hash (argon2)** — key = `ifk_<id>_<secret>`; find the row by id, verify the secret with argon2.

## Decision outcome

**Chosen:** Option 1. With 256 bits of randomness a fast digest is not brute-forceable even from a database dump, so slow hashing buys nothing and costs latency on every call; a pepper adds a setting whose loss or rotation silently kills every key. The checksum lets the handler refuse malformed keys before any lookup and lets scanners verify a match offline.

## Consequences

**Positive**
- One indexed lookup per call; no cache needed, so revocation is immediate.
- Malformed keys are refused before touching the database, which keeps invalid-key floods cheap.

**Negative**
- Anyone holding a database dump *and* a candidate key could confirm it is valid; accepted, since the candidate key is already the secret.

**Neutral**
- Changing the scheme later requires every Freelancer to create new keys; the `ifk_` prefix leaves room for a versioned prefix if that ever happens.

## Links

- Spec: [[../spec.md]] §1, §6.1, AC-02, AC-06, AC-07
- SAD: [[../sad.md]] §4, §8
- Related ADR: [[0003-admit-only-api-mcp-past-the-proxy-and-authenticate-it-by-bearer-key-alone]]
