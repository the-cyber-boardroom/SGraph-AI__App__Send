# send-api — Reality Index

**Domain:** `send-api/` | **Last updated:** 2026-08-25 | **Maintained by:** Librarian (daily run)

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
| POST | `/vault/batch/{vault_id}` | Up to 100 ops (`read`, `write`, `write-if-match`, `delete`), in order, best effort, stops at the first conflict or unknown op (earlier ops stay applied); all-`read` batch needs no auth and reads in parallel; any write needs token + write_key. `write-if-match` compares base64 `match` with the full current bytes in the Lambda (not a storage conditional write) | Yes |
| GET | `/vault/list/{vault_id}?prefix=` | List file_ids (unpaginated; skips manifest, tombstone and append entries; no auth) | Yes |
| GET | `/vault/health/{vault_id}` | Existence check + warm-up (`{status:"ok"}` or 404; no auth) | Yes |
| GET | `/vault/public-info/{vault_id}` | `public-vault.json` of a public vault (no auth; 501 when public vaults are not configured) | Yes |

**Corrected 2026-11-27 (cl-6.conductor, code-verified against the in-memory OpenAPI spec):** the four
rows above were live but missing from this table. The full vault surface is 29 route paths: 13 pointer
(including zip, destroy and three catch-alls for a missing `file_id`), 4 presigned, 12 append. Map and
callers: `team/roles/conductor/reviews/11/27/v0.33.69__map-and-plan__sg-api-for-vaults.md`.

**Storage model:** Blobs stored at `transfers/vault/{vault_id}/{file_id}/payload` in Storage_FS.
Write-key hash stored in `transfers/vault/{vault_id}/vault_pointer.json`.
Read-base64 response size limited to 3.75MB (Lambda response limit).
Destroy without `purge` writes a tombstone at `vault/{id[:2]}/{id}/deleted.json` to block vault_id reuse.
Destroy with `purge: true` skips the tombstone — vault_id is fully reusable afterwards.

### Vault Append (`/vault/append/*`) — 12 endpoints

Generic append-only, gate-controlled storage primitive. Not messaging-specific — same infrastructure
serves logs, signals, control messages, state flows, and email-style workflows.

Four-tier capability model: `append_token` (write-only), `enum_key` (list/fetch/mark-processed/unmark/stats; since v2 Phase 2 optionally **scoped** to named lanes),
`write_key` (purge + configure), `private_key` (decrypt — client-only, never on server).
Gates use `H(key) == stored_hash` pattern (SHA-256).

**Account-less write surface:** No SGraph access token required for write/list/fetch/mark-processed.
The append_token is the only gate. Deliberate design choice — enables cross-vault communication
without requiring both parties to have SGraph accounts.

| Method | Path | What It Does | Auth | Tested |
|--------|------|-------------|------|--------|
| GET | `/vault/append/limits` | Public server limits, `now_ms`, `config_ttl_seconds`, `features`; since Phase 2 also `token_lane_hard_ceiling`, `token_lane_bytes_ceiling`, `retention_classes` (`Cache-Control: no-store`; no vault input) — v2 Phase 1, 2026-11-25 | none | Yes |
| POST | `/vault/append/configure/{vault_id}` | Store append config. Since v2 Phase 1: on a vault with no commit yet it creates the manifest (first-write rule; a tombstone still refuses). **Since v2 Phase 2:** typed, merged per field (`append_anchors`, `enum_key_hash`, `legacy_enum_key`, `remove_legacy_enum_key`, `add_enum_keys`, `remove_enum_keys`, `lane_defaults`, `lanes`); unknown fields → 400 naming them; body > 64 KiB → 413; conditional write, 409 `conflict` after 3 attempts; returns `ignored` when a re-sent legacy key is not restored | write_key | Yes |
| POST | `/vault/append/write/{vault_id}` | Append encrypted payload (blind — no id/count returned) | append_token (body) | Yes |
| POST | `/vault/append/list/{vault_id}` | List entries (metadata or with content, paginated). Since v2 Phase 2: `folder` = `pending` (default) or `processed`; a scoped key sees only its lanes | enum_key (header) | Yes |
| POST | `/vault/append/fetch/{vault_id}` | Fetch content for specific file_ids (batched, max 100). Since v2 Phase 1: entries past a 5.5 MB encoded response ceiling come back in `deferred` (never read); the first entry is always returned | enum_key (header) | Yes |
| POST | `/vault/append/mark-processed/{vault_id}` | Move entries pending → processed (copy+delete, idempotent). Since v2 Phase 2: on S3, a lane with `retention_days` tags the copy `sg-retention=<N>d` | enum_key (header) | Yes |
| POST | `/vault/append/unmark/{vault_id}` | **v2 Phase 2.** Move entries processed → pending; hard limit applies (`refused`); clears object tags; unknown lane mode → 401 `lane_mode_unsupported`; bad key → **401** | enum_key (header) | Yes |
| POST | `/vault/append/stats/{vault_id}` | **v2 Phase 2.** One lane (`{inbox}`): pending count/bytes/oldest/newest, processed (capped 10,000), soft/hard/bytes limits, `over_soft`, `retention_days`; cached 30 s per instance; bad key → **401** | enum_key (header) | Yes |
| POST | `/vault/append/blob-upload/{vault_id}` | **v2 Phase 3.** `{append_token, size, sha256}` → one presigned, create-only S3 PUT (300 s) with size, hash, type and tag signed; reserves budget first (fixed-condition 507); 400 `blobs_disabled`, 413 `blob_too_large`, 401 auth / `lane_mode_unsupported`, **501 `presigned_not_available`** off S3 | append_token (body) | Yes |
| POST | `/vault/append/blob-url/{vault_id}` | **v2 Phase 3.** `{inbox, blob_ids}` (≤ 100) → presigned GETs (300 s, `application/octet-stream`, `attachment`) + `missing`; 501 off S3; bad key → 401 | enum_key (header) | Yes |
| POST | `/vault/append/blob-delete/{vault_id}` | **v2 Phase 3.** Delete named blobs (a keeper's orphan cleanup) → `{deleted, missing}`; bad key → 401 | enum_key (header) | Yes |
| POST | `/vault/append/purge/{vault_id}` | Delete entries from pending or processed (batched, max 100). Since v2 Phase 3: `folder: "blobs"` (named blob ids, or the lane's blobs and reservations) | write_key (header) | Yes |

**Edge rewrites API 403 → static `404.html` — measured 7 Sep 2026, NOT an API defect.** The
CDN in front of `send.sgraph.ai` applies the static site's `403 → /404.html` custom error
response to `/api/*` as well, so a gate failure on the append routes (wrong `append_token`,
wrong/missing `enum_key`) reaches clients as **404 with an HTML page**. Measured on the append
routes only — other routes gate on an access token (401) before any 403; per-status rules make
the same behaviour elsewhere likely but unverified. 400/401/404/405 pass through as JSON — a genuine route miss still answers 404 +
JSON, so the HTML body is the tell, not the status. The API itself returns the documented 403
(verified in-memory; 133 tests green). **Fix is infrastructure — no distribution config lives
in this repo.** Client-side mitigation shipped: `SGAppend._errorForResponse` raises `EEDGE` on
an HTML body and says the status is untrustworthy. Impact if unfixed: a rotated or revoked
append token — the expected lifecycle event for a published lane — reports as "page not found".

**Lane id (`inbox`) is the raw append token — code-verified 6 Sep 2026.** The pending/processed
folder is named with the **raw** token (`path__vault_append_pending(vault_id, token, …)` in
`Storage__Paths.py`, called with `token = _safe_token(append_token)`), and `list_entries()` returns
that folder name as each entry's `inbox` field. So an `enum_key` holder listing a lane learns that
lane's write token, and the raw token appears in storage object keys (and therefore in S3 access
logs, inventories and backups). `config.append_anchors` stores only `H(token)`, so the hashing
there buys less than it appears to. Not a privilege escalation — the append token is designed as a
public lane address (`H(recipient public key)`), grants write only, and `list` already requires the
`enum_key` — but it is unintended-looking and undocumented. Proposed fix: name the folder
`sha256(token)` and return that as `inbox`; `write` keeps its wire contract (it receives the raw
token and hashes it). Breaking change for existing lanes — needs migration.

**Security hardening:**
- Path-component inputs validated via `Safe_Str__Vault__Append_Token` and `Safe_Str__Vault__Append__File_Id` (Type_Safe strict validation) — blocks path traversal
- Batch operations capped at `APPEND_BATCH_MAX_FILE_IDS = 100`
- Per-message size cap: `APPEND_MAX_PAYLOAD = 5 MB` (≈ 4.4 MB on Lambda); per-lane pending cap: 1,000 by default, `hard_pending` 1–5,000 and `max_pending_bytes` 10 MiB–1 GiB per lane since v2 Phase 2 (`Vault__Append__Config.py`)
- `write` / `unmark` on a lane with an unknown `mode` → 401 `lane_mode_unsupported` (fail closed, v2 Phase 2)
- Metadata-only listing reads zero payloads; content reads only for the paged window
- Incremental ceiling check on include_content (M-1 fix) — bails early instead of reading all files
- Append config stored in separate `config.json` (L-2 fix) — `config.json` is the authoritative source for gates; manifest never written with append fields
- `Storage_FS__S3.folder__folders` implemented to prevent silent-empty drain on Lambda/S3
- `list_files` on vault pointer never returns append entries (regression-tested)

**Storage model:** Files stored inside `bare/append/` under the vault tree (managed-but-unversioned by sgit):
- Pending: `{_ROOT}/vault/{vault_id[:2]}/{vault_id}/bare/append/{token}/pending/{timestamp}_{random}.enc`
- Processed: `{_ROOT}/vault/{vault_id[:2]}/{vault_id}/bare/append/{token}/processed/{filename}`
- Blobs (v2 Phase 3): `{_ROOT}/vault/{vault_id[:2]}/{vault_id}/bare/append/blobs/{sha256(token)}/{sha256(ciphertext)}`; reservations alongside at `…/blobs/{sha256(token)}/.reserved/{expires_ms}_{size}_{blob_id}` (empty objects, tag `sg-retention=1d`). `blobs` is not hex, so lane discovery skips it. Vault delete removes them with everything else under the vault prefix; `list_files` never returns them (only `/payload` keys)
- Config: `{_ROOT}/vault/{vault_id[:2]}/{vault_id}/bare/append/config.json` — keys `append_anchors`, `enum_key_hash` (legacy, scope `*`), `enum_keys` (scoped), `lane_defaults`, `lanes` (v2 Phase 2; older code ignores the new keys)

**LocalStack S3 integration tests — EXIST since v2 Phase 1/2 (2026-11-25):**
`tests/unit/lambda__user/storage/test_Storage_FS__S3__LocalStack.py` (14; skipped when LocalStack is not
reachable — the CI workflow does not start it, so these run locally only): early-stop count, `StartAfter`
paging across 1,000 keys, delimiter discovery, `CopyObject`, usage, tags set/cleared on copy,
`If-None-Match`, `If-Match` (skips on LocalStack 3, which ignores it), the append service end to end, and
(Phase 3) a real presigned blob PUT/GET round trip, a wrong hash refused by S3, and 50 URLs issued before any
upload staying inside the budget. The signed-header list is pinned offline in
`test_Storage_FS__S3__Presign.py` (3, runs in CI).

### Vault Zip (`/vault/zip/*`) — 1 endpoint

| Method | Path | What It Does | Tested |
|--------|------|-------------|--------|
| GET | `/vault/zip/{vault_id}` | Download vault as ZIP archive (content-addressable cached) | Yes (19 tests) |

Route registered at `Routes__Vault__Pointer.py:234`. `Service__Vault__Zip` is injected by
`Fast_API__SGraph__App__Send__User` and reuses the vault storage backend for cache.
**Corrected 2026-08-25:** Previously marked PROPOSED (OQ-2); code-verified as EXISTS.

---

### Room Join (`/join/*`) — 0 live endpoints (orphaned code)

**Code-verified 2026-08-17:** `Routes__Join.py` exists on disk but is NOT registered in
`Fast_API__SGraph__App__Send__User.setup_routes()` — no `/join/*` path appears in the live
OpenAPI spec, and no other file references the class. The three endpoints previously listed
here (`/join/validate/{invite_code}`, `/join/accept/{invite_code}`, `/join/session-validate`)
do not exist on the deployed API. The file also imports 4 classes from `lambda__admin`
(the only user→admin source coupling) and is a recorded deletion candidate — see
`library/sgraph-send/dev_packs/v0.33.59__sgit-api-extraction/05__deletion-candidates.md`.

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
- Token validation: header **`x-sgraph-access-token`** or `?access_token=` query param — corrected 2026-09-09. The previously documented `x-sgraph-send-access-token` is **not** a valid header name: measured 401 vs 200 for the correct one against the in-memory stack (`HEADER__SGRAPH_SEND__ACCESS_TOKEN = 'x-sgraph-access-token'` in `user__config.py` — the constant NAME contains `SEND`, the header VALUE does not). Any integrator following the old line got 401s. Query-param form works but leaks the token into logs; header is the documented path.
- Inter-Lambda: User Lambda calls Admin Lambda for token validation
- Storage: Memory-FS (dev/test), S3 (prod) — auto-detected via `SEND__STORAGE_MODE`

---

## DOES NOT EXIST (Commonly Confused)

| Claimed | Reality |
|---------|---------|
| `GET /api/vault/bundle/{vault_id}/{bundle_file_id}` | PROPOSED — single-call vault clone, no code |
| `GET /api/vault/zip/{vault_id}` (optional read-only snapshot) | **EXISTS** — corrected 2026-08-25; see Vault Zip section above |
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
- ~~**`/api/vault/zip` read-only access**~~ — **EXISTS** (corrected 2026-08-25; see Vault Zip section)
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
