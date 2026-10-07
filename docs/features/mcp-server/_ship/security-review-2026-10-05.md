# Security review — mcp-server (diff 29f4225..HEAD)

Date: 2026-10-05 · Scope: what mcp-server adds on top of security-patch · Read-only review (no edits, no DB, no commits).

## Verdict

**CLEAN for HIGH/MEDIUM.** One LOW finding (incomplete prompt-injection marking, an AC-19b gap). Nothing blocks ship from a security standpoint.

## Findings

### L-01 (LOW): some free text the Freelancer typed is returned without the `freelancerText` marking (AC-19b)

- `lib/mcp/tools/shared.ts:78-86` (`wrapInvoiceRow`) and `lib/mcp/tools/search.ts:77`: `invoiceNumber` is returned as a raw string in every invoice row (search_invoices, list_overdue_invoices, expected payments).
- `lib/mcp/tools/invoice.ts:56-58`: `get_invoice` spreads `...a`, so `invoiceNumber` is raw. Lines 59-78 wrap most sender and customer fields but leave `sender.email`, `sender.website` and `customer.email` raw.
- `lib/mcp/answers.ts:50`: the `invoiceNumber` of an ambiguous-invoice candidate is raw.
- `lib/mcp/tools/customers.ts:57-66`: `email` is raw.

**Attack.** A manual invoice number is unbounded free text: `lib/validations/invoice.ts:111` is `z.string().trim()` with no max and no character rule. `website` only needs to be some http(s) URL, so its path and query can hold any text (`lib/validations/web-address.ts`). The usual way this happens: a customer's PO or reference string, or a URL from a customer, is pasted into one of these fields. That text can then reach the Assistant unmarked, while every other free-text field carries the marking. Keys are read-only, so nothing inside Invoice Forge can be damaged. The risk is the outside-Invoice-Forge injection residual that spec §6.1 names. That residual assumes every free-text field is marked, and these fields break that assumption. Email fields are format-validated, so very little text fits there.

**Minimal fix.** Wrap `invoiceNumber` (rows, the get_invoice answer and candidates) and `website`/`email` with `freelancerText(...)` / `nullableFreelancerText(...)`. Update the output zod schemas and openapi to match. Optionally cap a manual `invoiceNumber` at about 100 characters in `invoiceFormSchema`.

## Checked and found sound (no finding)

- **Proxy exception** (`config/routes.config.ts:146,175`, `proxy.ts:70-91`): only an exact `pathname === '/api/mcp'` match is exempt. Every variant (trailing slash, `/api/mcp/x`, `/API/MCP`, `/api/%6Dcp`) fails the match and is refused with 401 for anonymous non-safe methods. All of them fail closed, never open. GET, HEAD and OPTIONS were already safe methods. The route answers GET/DELETE with 405, Next derives HEAD from GET, and the automatic OPTIONS sends no CORS headers. Only `app/api/mcp/route.ts` exists under that path. A route handler does not dispatch `Next-Action` server actions. A signed-in browser's cookies are ignored, because the handler reads only `Authorization`. Cross-site requests cannot set a Bearer header without a CORS preflight, which is never granted.
- **Pipeline order** (`lib/mcp/authenticate.ts`): source limit, then Bearer, then key check, then key limit, all before the body is read. The 401 is byte-identical for missing, malformed, unknown and revoked keys. A store failure gives 503 and records no refusal. All limits fail closed (`lib/security/limits/mcp.ts`). The body is capped at 64 KiB while streaming, and batches are refused.
- **Keys** (`lib/services/personal-keys/key-format.ts`): 256-bit CSPRNG secret, SHA-256 digest, unique index, and only the digest is stored. `lastFour` is checksum characters, so it reveals nothing about the secret. The lookup is `revokedAt IS NULL` with no cache, so revocation has a 0 s grace. Joining `User` means a deleted account's key fails at once. The only timing difference is malformed (no query) vs well-formed, and the client can compute that itself.
- **Revoke/create actions** (`lib/actions/personal-key-actions.ts`, `lib/services/personal-keys/personal-keys.ts:74-84`): session actor, then `updateMany` scoped by `userId`. Another Freelancer's key id gives the same NOT_FOUND as a missing one. Next server actions check Origin (CSRF). The full key is returned once and kept only in React state, never in storage or logs.
- **Cross-tenant isolation (AC-08)**: every Assistant read filters by owner in its own where clause. That covers `find-by-reference.ts:223-226`, `assistant-search.ts:127,138,165`, `customers.ts` `nameMatchWhere`/`listCustomersForAssistant`, `resolve-by-name.ts:28` and every `queries.ts` raw query (`sp."userId" = ${actor.userId}`). Ids from another tenant get the same NOT_FOUND text as missing ones.
- **Raw SQL**: everything is tagged-template `$queryRaw`/`$executeRaw`. The only `Prisma.raw` is the code-constant alias in `overdue.ts:45`. There is no `*Unsafe` anywhere in `lib`/`app`. `escapeLike` is applied to `contains` filters.
- **Bank numbers**: `find-by-reference.ts` `answerSelect` selects no `bank*`/`accountName` column, and no other tool touches bank accounts.
- **Export** (`lib/services/account/account.ts`): explicit select (name, dates, usage weeks). No digest, `lastFour`, `activeNameKey` or id. **Deletion**: FK `ON DELETE CASCADE` User → PersonalKey → PersonalKeyUsageWeek.
- **Logging/Sentry**: key-check errors log only `error.name`. A JSON parse error is not reported, because its message would quote the body. The MCP request's headers, body and cookies are scrubbed in `beforeSend`/`beforeSendTransaction`. `httpIntegration.ignoreIncomingRequestBody` covers `/api/mcp`, with a decode-tolerant `isMcpUrl` that scrubs whenever it is unsure. Span names carry the tool name only.
- **Sign-in return path** (`lib/auth/sign-in-return-path.ts`, `lib/auth/redirect-target.ts`): only a path is accepted (no `//`, `\` or control characters), and Auth.js prefixes `baseUrl`, so there is no open redirect.
- **x-forwarded-host** (`app/api/mcp/route.ts:169-174`, `app/(protected)/settings/assistants/page.tsx:14-18`): on Vercel the platform sets this header, so a client cannot spoof it. Even off Vercel, a spoofed value would only change links in the spoofer's own uncached response. A victim's links cannot be poisoned.
- **Source IP** (`lib/security/limits/keys.ts:69-73`): `x-real-ip` via `@vercel/functions`, which is platform-set on Vercel. When it is missing on Vercel, the request fails closed with 503. This is unchanged from security-patch, and brute force is infeasible anyway against a 256-bit key.

## Noted, not reported (accepted by design or not exploitable)

- The per-source block (30 refused checks in 5 min) also refuses valid keys from that source. That is spec-defined. Someone behind the same NAT/VPN could lock the other users out for 5 minutes at a time. Every supported client (Claude Code, Cursor, mcp-remote) connects from the user's own network, so the impact is limited to co-located attackers.
- A leaked key reads everything until revoked. This is the residual risk accepted in spec §6.1.
