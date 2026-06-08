# send-api — Reality Index

**Domain:** `send-api/` | **Last updated:** 2026-05-12 | **Maintained by:** Librarian (daily run)

The User Lambda: the public-facing API at `send.sgraph.ai`. Handles encrypted file transfers,
multipart uploads, vault blob storage (pointer model), vault append-only storage,
room joins, early access signups, and MCP tool exposure. All 32 API endpoints are tested and passing.

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

### Vault Pointer (`/vault/*`) — 9 endpoints

The User Lambda implements a zero-knowledge vault blob store. The server holds AES-256-GCM
ciphertext — it never decrypts. Reads are public; writes are double-gated (access token + write_key).

| Method | Path | What It Does | Tested |
|--------|------|-------------|--------|
| PUT | `/vault/write/{vault_id}/{file_id}` | Write encrypted blob (auth + write_key required) | Yes |
| GET | `/vault/read/{vault_id}/{file_id}` | Read encrypted blob (raw binary, no auth) | Yes |
| GET | `/vault/read-base64/{vault_id}/{file_id}` | Read as base64 JSON (MCP-safe, no auth) | Yes |
| DELETE | `/vault/delete/{vault_id}/{file_id}` | Delete vault file (auth + write_key required) | Yes |
| DELETE | `/vault/destroy/{vault_id}` | Delete entire vault; body `{vault_id, purge?: bool}`; `purge=true` skips tombstone | Yes |
| POST | `/vault/presigned/initiate/{vault_id}` | Initiate S3 multipart for large blob (auth + write_key) | Yes |
| POST | `/vault/presigned/complete/{vault_id}` | Complete S3 multipart (auth + write_key) | Yes |
| POST | `/vault/presigned/cancel/{vault_id}` | Cancel S3 multipart (auth + write_key) | Yes |
| GET | `/vault/presigned/read-url/{vault_id}/{file_id}` | Presigned S3 GET URL (no auth) | Yes |

**Storage model:** Blobs stored at `transfers/vault/{vault_id}/{file_id}/payload` in Storage_FS.
Write-key hash stored in `transfers/vault/{vault_id}/vault_pointer.json`.
Read-base64 response size limited to 3.75MB (Lambda response limit).
Destroy without `purge` writes a tombstone at `vault/{id[:2]}/{id}/deleted.json` to block vault_id reuse.
Destroy with `purge: true` skips the tombstone — vault_id is fully reusable afterwards.

### Vault Append (`/vault/append/*`) — 6 endpoints

Generic append-only, gate-controlled storage primitive. Not messaging-specific — same infrastructure
serves logs, signals, control messages, state flows, and email-style workflows.

Four-tier capability model: `append_token` (write-only), `enum_key` (list/fetch/mark-processed),
`write_key` (purge + configure), `private_key` (decrypt — client-only, never on server).
Gates use `H(key) == stored_hash` pattern (SHA-256).

**Account-less write surface:** No SGraph access token required for write/list/fetch/mark-processed.
The append_token is the only gate. Deliberate design choice — enables cross-vault communication
without requiring both parties to have SGraph accounts.

| Method | Path | What It Does | Auth | Tested |
|--------|------|-------------|------|--------|
| POST | `/vault/append/configure/{vault_id}` | Store append config (enum_key_hash, append_token hashes) | write_key | Yes |
| POST | `/vault/append/write/{vault_id}` | Append encrypted payload (blind — no id/count returned) | append_token (body) | Yes |
| POST | `/vault/append/list/{vault_id}` | List pending entries (metadata or with content, paginated) | enum_key (header) | Yes |
| POST | `/vault/append/fetch/{vault_id}` | Fetch content for specific file_ids (batched, max 100) | enum_key (header) | Yes |
| POST | `/vault/append/mark-processed/{vault_id}` | Move entries pending → processed (copy+delete, idempotent) | enum_key (header) | Yes |
| POST | `/vault/append/purge/{vault_id}` | Delete entries from pending or processed (batched, max 100) | write_key (header) | Yes |

**Security hardening:**
- Path-component inputs validated via `Safe_Str__Vault__Append_Token` and `Safe_Str__Vault__Append__File_Id` (Type_Safe strict validation) — blocks path traversal
- Batch operations capped at `APPEND_BATCH_MAX_FILE_IDS = 100`
- Per-message size cap: `APPEND_MAX_PAYLOAD = 5 MB`; per-token file-count cap: `APPEND_MAX_FILES = 1000`
- Metadata-only listing reads zero payloads; content reads only for the paged window
- Incremental ceiling check on include_content (M-1 fix) — bails early instead of reading all files
- Append config stored in separate `config.json` (L-2 fix) — `config.json` is the authoritative source for gates; manifest never written with append fields
- `Storage_FS__S3.folder__folders` implemented to prevent silent-empty drain on Lambda/S3
- `list_files` on vault pointer never returns append entries (regression-tested)

**Storage model:** Files stored inside `bare/append/` under the vault tree (managed-but-unversioned by sgit):
- Pending: `{_ROOT}/vault/{vault_id[:2]}/{vault_id}/bare/append/{token}/pending/{timestamp}_{random}.enc`
- Processed: `{_ROOT}/vault/{vault_id[:2]}/{vault_id}/bare/append/{token}/processed/{filename}`
- Config: `{_ROOT}/vault/{vault_id[:2]}/{vault_id}/bare/append/config.json`

**TODO — LocalStack S3 integration tests:** All append tests run on the memory backend.
Behavioural parity on S3 is verified structurally (method-override assertions in `test_Storage_FS__S3.py`)
but not exercised end-to-end via LocalStack. This is not urgent — the memory backend faithfully
exercises all service logic — but should be done before production launch.

### Room Join (`/join/*`) — 3 endpoints

| Method | Path | What It Does | Tested |
|--------|------|-------------|--------|
| GET | `/join/validate/{invite_code}` | Validate room invite (no consumption) | Yes |
| POST | `/join/accept/{invite_code}` | Accept invite, join room, get session | Yes |
| GET | `/join/session-validate` | Validate room session token | Yes |

### Vault Inbox (`/api/vault/inbox/*`) — 6 endpoints

Append-only inbox layer for vault-to-vault communications. Four-tier capability model:
`append_token` (write-only) → `enum_key` (list/fetch/mark-processed) → `private_key` (decrypt, client-side) → `write_key` (purge + configure).

| Method | Path | Auth | What It Does | Tested |
|--------|------|------|-------------|--------|
| POST | `/api/vault/inbox/append/{vault_id}` | append_token in body | Write-blind append of encrypted payload | Yes |
| POST | `/api/vault/inbox/list/{vault_id}` | x-sgraph-vault-enum-key header | Paginated list; optional inline content | Yes |
| POST | `/api/vault/inbox/fetch/{vault_id}` | x-sgraph-vault-enum-key header | Batch fetch by file_ids | Yes |
| POST | `/api/vault/inbox/mark-processed/{vault_id}` | x-sgraph-vault-enum-key header | Reversible move: inbox/ → processed/ | Yes |
| POST | `/api/vault/inbox/purge/{vault_id}` | x-sgraph-vault-write-key header | Irreversible delete (owner only) | Yes |
| POST | `/api/vault/inbox/configure/{vault_id}` | x-sgraph-vault-write-key header | Set append_anchors + enum_key_hash | Yes |

**101 new tests** (62 service-level + 39 HTTP route tests). Shipped: commit `9d727b5`.

**Security hardening** (commit `e365c60`, 2026-06-05): path traversal closed via `Safe_Str__Vault__Append_Token` + `Safe_Str__Vault__Inbox__File_Id`; S3 `folder__folders` silent-empty bug fixed; metadata listing reads zero payload bytes; batch cap 100 `file_ids`; additional traversal negative tests added.

### Other — 2 endpoints

| Method | Path | What It Does | Tested |
|--------|------|-------------|--------|
| POST | `/early-access/signup` | Early Access signup (email, name, use case) | Yes |
| GET | `/` | Redirect to latest user UI | Yes |
| GET | `/mcp` | MCP server (stateless HTTP transport) | Yes |

**Total:** 40 route paths (32 unique API endpoints). All tested.

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
- **Clone Pack endpoints** — `GET /vaults/{vault_id}/packs/{commit_id}/{flavour}` + `POST /vaults/{vault_id}/objects/missing` (doc 348 / brief 08b). Binary `SGPK` pack format. 40–100× clone speedup. PackBuilder + PackCache + pre-warming hook on push. Zero-knowledge preserved (ciphertext only). Requires 5 architect decisions before implementation.
- **PackBuilder** — server-side binary pack assembler. Walks commit graph for `full`/`head`/`bare-full`/`bare-head` flavours, assembles sorted ciphertext into `SGPK` format. (doc 348)
- **PackCache** — LRU on-disk cache under `packs/` storage namespace. Configurable budget: 100 packs OR 5 GB per vault. Eviction protects latest-3 packs per commit. (doc 348)

---

## Sub-files

*Currently all content is in this index. When this file exceeds ~300 lines, split into:*
- `transfers.md` — /transfers/* and /presigned/* detail
- `vault-pointer.md` — /vault/* detail + storage model
- `rooms.md` — /join/* detail
- `mcp.md` — MCP tools + verified integrations
