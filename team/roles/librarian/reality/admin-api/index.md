# admin-api — Reality Index

**Domain:** `admin-api/` | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

The Admin Lambda: auth-protected API for system administration. Handles access tokens, PKI key
registry, vault management (legacy model), users, data rooms, invites, cache inspection, health
monitoring, and MCP tool exposure. Cookie-authenticated (different auth model from User Lambda).

---

## EXISTS (Code-Verified)

**Total:** 51 API endpoints + 1 static + 4 MCP/well-known + 5 info = 61 route paths. All tested.

**MCP tools exposed:** all `tokens`, `keys`, `vault`, and `users` tagged endpoints.

### Tokens (`/tokens/*`) — 8 endpoints

| Method | Path | What It Does | Tested |
|--------|------|-------------|--------|
| POST | `/tokens/create` | Create access token | Yes |
| GET | `/tokens/lookup/{name}` | Token metadata | Yes |
| POST | `/tokens/use/{name}` | Record token usage, decrement limit | Yes |
| POST | `/tokens/revoke/{name}` | Revoke token | Yes |
| POST | `/tokens/update-limit/{name}` | Change usage limit | Yes |
| POST | `/tokens/reactivate/{name}` | Reactivate revoked/exhausted token | Yes |
| GET | `/tokens/list` | List token names | Yes |
| GET | `/tokens/list-details` | All tokens with full data (bulk) | Yes |

### PKI Key Registry (`/keys/*`) — 5 endpoints

| Method | Path | What It Does | Tested |
|--------|------|-------------|--------|
| POST | `/keys/publish` | Publish RSA public key to registry | Yes |
| GET | `/keys/lookup/{code}` | Lookup key by code | Yes |
| DELETE | `/keys/unpublish/{code}` | Mark key inactive | Yes |
| GET | `/keys/list` | List all keys | Yes |
| GET | `/keys/log` | Transparency log | Yes |

### Vault (Legacy Model) (`/vault/*`) — 18 endpoints

> **Note:** This is the older, higher-level vault API (folders, files, index, ACL). The newer
> vault design uses the User Lambda vault pointer model (raw blob CAS). Both exist simultaneously.

| Method | Path | What It Does | Tested |
|--------|------|-------------|--------|
| POST | `/vault/create` | Create encrypted vault | Yes |
| GET | `/vault/lookup/{key}` | Vault manifest | Yes |
| GET | `/vault/exists/{key}` | Check vault exists | Yes |
| POST | `/vault/folder` | Store encrypted folder | Yes |
| GET | `/vault/folder/{key}/{guid}` | Get folder | Yes |
| GET | `/vault/folders/{key}` | List folders | Yes |
| POST | `/vault/file` | Store encrypted file (<6MB) | Yes |
| GET | `/vault/file/{key}/{guid}` | Get file | Yes |
| GET | `/vault/files/{key}` | List files | Yes |
| POST | `/vault/file-chunk` | Upload file chunk (large files) | Yes |
| POST | `/vault/file-assemble` | Assemble chunks into file | Yes |
| POST | `/vault/index` | Store encrypted vault index | Yes |
| GET | `/vault/index/{key}` | Get vault index | Yes |
| GET | `/vault/list-all/{key}` | Full vault inventory | Yes |
| POST | `/vault/share/{key}` | Grant vault access | Yes |
| DELETE | `/vault/unshare/{key}/{user_id}` | Revoke vault access | Yes |
| GET | `/vault/permissions/{key}` | List ACL entries | Yes |

### Users (`/users/*`) — 4 endpoints

| Method | Path | What It Does | Tested |
|--------|------|-------------|--------|
| POST | `/users/create` | Create user (bound to PKI key) | Yes |
| GET | `/users/lookup/{id}` | User metadata | Yes |
| GET | `/users/fingerprint/{fp}` | Reverse lookup by fingerprint | Yes |
| GET | `/users/list` | List users | Yes |

### Data Rooms (`/rooms/*`) + Invites (`/invites/*`) — 12 endpoints

| Method | Path | What It Does | Tested |
|--------|------|-------------|--------|
| POST | `/rooms/create` | Create data room (+ vault) | Yes |
| GET | `/rooms/lookup/{id}` | Room details | Yes |
| GET | `/rooms/list` | List rooms | Yes |
| POST | `/rooms/archive/{id}` | Archive room | Yes |
| GET | `/rooms/members/{id}` | List members | Yes |
| POST | `/rooms/members-add/{id}` | Add member | Yes |
| DELETE | `/rooms/members-remove/{id}/{user}` | Remove member | Yes |
| POST | `/rooms/invite/{id}` | Generate invite code | Yes |
| GET | `/rooms/audit/{id}` | Room audit trail | Yes |
| GET | `/invites/validate/{code}` | Validate invite | Yes |
| POST | `/invites/accept/{code}` | Accept invite | Yes |
| POST | `/invites/expire/{code}` | Expire invite | Yes |

### Cache + Health — 5 endpoints

| Method | Path | What It Does | Tested |
|--------|------|-------------|--------|
| GET | `/cache/namespaces` | List cache namespaces | Yes |
| GET | `/cache/folders/{path}` | Browse cache folders | Yes |
| GET | `/cache/files/{path}` | List cache files | Yes |
| GET | `/cache/entry/{ns}/{id}` | Raw cache entry | Yes |
| GET | `/health/pulse` | Real-time traffic pulse | Yes |

### MCP — 1 endpoint

| Method | Path | What It Does |
|--------|------|-------------|
| GET | `/mcp` | MCP server (stateless) | Yes |

### Cache Namespaces (10 total)

`analytics`, `tokens`, `costs`, `transfers`, `keys`, `users`, `rooms`, `invites`, `audit`, `sessions`

---

## DOES NOT EXIST (Commonly Confused)

| Claimed | Reality |
|---------|---------|
| MCP `rooms_create` / `rooms_add_user` / `rooms_revoke_user` tools | PROPOSED — rooms API exists, not MCP-exposed |
| Stripe webhook → auto-token creation | PROPOSED — manual token creation still required |
| Symmetric Data Room key exchange | Room has AES key but exchange is manual (out-of-band) |

---

## PROPOSED

Full list: [proposed/index.md](proposed/index.md)

- **Backend storage restructuring** — new Storage_FS layout, deterministic-safe paths (doc 223)
- **MCP rooms tools** — expose rooms/invites API via MCP
- **Vault bundle endpoint** — `GET /api/vault/bundle/{vault_id}` single-call clone (v0.13.19)

---

## Sub-files

*Currently all content is in this index. Split candidates when this file grows:*
- `tokens.md` — token lifecycle detail
- `vault-legacy.md` — older vault API vs. User Lambda vault pointer model comparison
- `rooms.md` — rooms + invites detail
