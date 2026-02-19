# Functionality Suggestions from Security Review

**Type:** Feature suggestions
**Source:** User A (security reviewer) — 10 suggestions; User B (beta tester) — 3 requests
**Status:** Open

---

## User A's Suggestions (10)

| Priority | Feature | Approach | On Roadmap? |
|----------|---------|----------|-------------|
| **High** | Transfer expiration (TTL) | `expires_at` in metadata. Sender chooses duration (1h, 24h, 7d, 30d). Return 410 Gone if expired. S3 lifecycle for cleanup. `EXPIRED` status exists in code but is never set. | Yes |
| **High** | Orphan cleanup | Auto-expire `PENDING` transfers after 1 hour. Check on read or periodic Lambda. | Partially |
| **High** | Download limits | Optional `max_downloads` field (1, 5, 10, unlimited). Enforce in download endpoint. Combine with TTL for "burn after reading" (`max_downloads=1, ttl=24h`). | Yes |
| **High** | Sender-side deletion | Return `delete_secret` at upload. Store SHA-256 hash in metadata. Possession = proof of ownership. Firefox Send approach. | Yes (implied) |
| **Medium** | Browse own files | Client-side localStorage manifest after each upload. New `<send-my-files>` web component. Zero server changes. Depends on localStorage fix (#5). | Yes |
| **Medium** | Sender status page | Return `status_url` with secret at upload. Shows download count, time remaining, delete option. Secret = proof of sender identity. | Yes |
| **Medium** | Exportable encrypted manifest | Encrypt localStorage upload list with user passphrase (AES-256-GCM). Export/import as `.enc` file. Cross-device, zero server trust. | Yes |
| **Low** | Token-scoped file listing | `GET /tokens/{name}/transfers` (admin-authenticated). `token_name` already stored via `token_use()`. Infrastructure partially built. | Partially |
| **Low** | Password-protected downloads | Optional `bcrypt(password)` in metadata. Two-factor: something you have (key) + something you know (password). | Partially |
| **Low** | Download notifications | Webhook or email on first download. Minimal payload — event only, no content or key. Privacy consideration for stored email. | **New** — add to roadmap |

## User B's Requests (3)

| # | Request | Roadmap Status |
|---|---------|---------------|
| 1 | Expiring links | Yes — maps to TTL above |
| 2 | User-defined encryption key | Yes — key management for recurring relationships |
| 3 | Certificate-based encryption | Yes — PKI support |

## Key Insight

**12 of 13** suggestions are already on the roadmap. This validates product direction — we're building what users actually want. The one new item (download notifications) should be added to the roadmap.

## Approach

These are not incident fixes — they're feature work for the Explorer team's backlog. The Architect should sequence them against the existing roadmap and assess whether this feedback changes priority order.
