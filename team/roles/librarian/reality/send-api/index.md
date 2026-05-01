# send-api — Reality Index

**Domain:** `send-api/` | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

The User Lambda: the public-facing API at `send.sgraph.ai`. Handles encrypted file transfers,
multipart uploads, vault blob storage (pointer model), room joins, early access signups, and
MCP tool exposure. All 26 API endpoints are tested and passing.

---

## EXISTS (Code-Verified)

### Transfers (`/transfers/*`) — 8 endpoints

| Method | Path | What It Does | Tested |
|--------|------|-------------|--------|
| POST | `/transfers/create` | Create transfer, get transfer_id | Yes |
| POST | `/transfers/upload/{id}` | Upload encrypted payload (direct, <6MB) | Yes |
| POST | `/transfers/complete/{id}` | Mark transfer ready for download | Yes |
| GET | `/transfers/info/{id}` | Transfer metadata (size, status, downloads) | Yes |
| GET | `/transfers/download/{id}` | Download encrypted payload | Yes |
| GET | `/transfers/download-base64/{id}` | Download as base64 (MCP compat) | Yes |
| GET | `/transfers/check-token/{name}` | Validate token (no usage consumed) | Yes |
| POST | `/transfers/validate-token/{name}` | Validate token (consumes one use) | Yes |

### Presigned Uploads (`/presigned/*`) — 6 endpoints

| Method | Path | What It Does | Tested |
|--------|------|-------------|--------|
| GET | `/presigned/capabilities` | Check upload modes (direct/presigned/multipart) | Yes |
| POST | `/presigned/initiate` | Start multipart upload, get presigned URLs | Yes |
| POST | `/presigned/complete` | Complete multipart upload | Yes |
| POST | `/presigned/cancel/{transfer_id}/{upload_id}` | Cancel multipart upload | Yes |
| GET | `/presigned/upload-url/{id}` | Get single presigned PUT URL | Yes |
| GET | `/presigned/download-url/{id}` | Get presigned S3 GET URL | Yes |

### Vault Pointer (`/vault/*`) — 8 endpoints

The User Lambda implements a zero-knowledge vault blob store. The server holds AES-256-GCM
ciphertext — it never decrypts. Reads are public; writes are double-gated (access token + write_key).

| Method | Path | What It Does | Tested |
|--------|------|-------------|--------|
| PUT | `/vault/write/{vault_id}/{file_id}` | Write encrypted blob (auth + write_key required) | Yes |
| GET | `/vault/read/{vault_id}/{file_id}` | Read encrypted blob (raw binary, no auth) | Yes |
| GET | `/vault/read-base64/{vault_id}/{file_id}` | Read as base64 JSON (MCP-safe, no auth) | Yes |
| DELETE | `/vault/delete/{vault_id}/{file_id}` | Delete vault file (auth + write_key required) | Yes |
| POST | `/vault/presigned/initiate/{vault_id}` | Initiate S3 multipart for large blob (auth + write_key) | Yes |
| POST | `/vault/presigned/complete/{vault_id}` | Complete S3 multipart (auth + write_key) | Yes |
| POST | `/vault/presigned/cancel/{vault_id}` | Cancel S3 multipart (auth + write_key) | Yes |
| GET | `/vault/presigned/read-url/{vault_id}/{file_id}` | Presigned S3 GET URL (no auth) | Yes |

**Storage model:** Blobs stored at `transfers/vault/{vault_id}/{file_id}/payload` in Storage_FS.
Write-key hash stored in `transfers/vault/{vault_id}/vault_pointer.json`.
Read-base64 response size limited to 3.75MB (Lambda response limit).

### Room Join (`/join/*`) — 3 endpoints

| Method | Path | What It Does | Tested |
|--------|------|-------------|--------|
| GET | `/join/validate/{invite_code}` | Validate room invite (no consumption) | Yes |
| POST | `/join/accept/{invite_code}` | Accept invite, join room, get session | Yes |
| GET | `/join/session-validate` | Validate room session token | Yes |

### Other — 2 endpoints

| Method | Path | What It Does | Tested |
|--------|------|-------------|--------|
| POST | `/early-access/signup` | Early Access signup (email, name, use case) | Yes |
| GET | `/` | Redirect to latest user UI | Yes |
| GET | `/mcp` | MCP server (stateless HTTP transport) | Yes |

**Total:** 34 route paths (26 unique API endpoints). All tested.

### MCP Exposure

MCP tools exposed from User Lambda: all `transfers`, `presigned`, and `vault` tagged endpoints
(including `read-base64` and vault presigned endpoints).

**Verified working:** Claude.ai generated PDF, encrypted it, uploaded via MCP, human decrypted
in browser (Milestone M-007).

### Key architectural properties

- No API Gateway — Lambda URL direct HTTPS
- Token validation: header `x-sgraph-send-access-token` or query param
- Inter-Lambda: User Lambda calls Admin Lambda for token validation
- Storage: Memory-FS (dev/test), S3 (prod) — auto-detected via `SEND__STORAGE_MODE`

---

## DOES NOT EXIST (Commonly Confused)

| Claimed | Reality |
|---------|---------|
| `GET /api/vault/bundle/{vault_id}/{bundle_file_id}` | PROPOSED — single-call vault clone, no code |
| `GET /api/vault/zip/{vault_id}` (optional read-only snapshot) | PROPOSED — open question OQ-2 from 04/28 architect review |
| MCP `secrets_create` / `rooms_create` / `rooms_add_user` tools | PROPOSED — rooms API exists but not MCP-exposed |
| Stripe webhook → auto-token creation | PROPOSED — manual token creation still required |
| One-Time Secret Links (`/secret`) | No code |

---

## PROPOSED

Selected key proposals for this domain. Full list: [proposed/index.md](proposed/index.md)

- **SgSend JS API** (`sendFile`, `sendText`, `sendFolder`) — browser-native send API (doc 303)
- **`<sg-send-drop>`, `<sg-send-receive>`, `<sg-send-panel>`** — embeddable send/receive Web Components (doc 303)
- **Large blob client phases 2–4** — client-side `large: bool` routing (Phase 1 server endpoints EXIST; client routing PROPOSED)
- **WhatsApp share mode** — share-via-WhatsApp integration (doc 259)
- **Four collaborative upload modes** — individual, room, vault-push, vault-merge (doc 231)
- **`/api/vault/zip` read-only access** — accept structure_key for vault snapshot pull (OQ-2)

---

## Sub-files

*Currently all content is in this index. When this file exceeds ~300 lines, split into:*
- `transfers.md` — /transfers/* and /presigned/* detail
- `vault-pointer.md` — /vault/* detail + storage model
- `rooms.md` — /join/* detail
- `mcp.md` — MCP tools + verified integrations
