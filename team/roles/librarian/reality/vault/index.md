# vault — Reality Index

**Domain:** `vault/` | **Last updated:** 2026-07-01 | **Maintained by:** Librarian (daily run)

The vault/SGit cryptographic storage system. This domain covers the encryption layer, the
object storage model, the browser JS client, PKI, and the sgit CLI as it relates to vault
operations. The vault system spans multiple surfaces (server pointer API, browser client, CLI)
— each surface has its own domain (`send-api/`, `ui/`, `cli/`); this domain covers the
shared cryptographic and storage design.

**⚠️ Active design change:** The structure key encryption split (04/28 Architect Review)
is a four-team change. See `proposed/structure-key-split.md`.

> **Code index (2026-07-24):** per-file navigation for the browser vault implementation
> (`sgraph_ai_app_send__ui__vault/`) lives at `team/roles/librarian/code-index/vault-web/`.

---

## EXISTS (Code-Verified)

### Key Derivation (Correct — Both Paths)

**Standard vault key (`passphrase:vault_id`):**
```
read_key      = PBKDF2(passphrase, salt='sg-vault-v1:{vault_id}',        600k iterations)
write_key     = PBKDF2(passphrase, salt='sg-vault-v1:write:{vault_id}',  600k iterations)
structure_key = HKDF(read_key,     info=b'sg-vault-v1:structure-key')
```

**Simple token (`word-word-NNNN`):**
```
aes_key       = PBKDF2(token,      salt=b'sgraph-send-v1',               600k iterations)
read_key      = HKDF(aes_key,      info=b'vault-read-key')
write_key     = HKDF(aes_key,      info=b'vault-write-key')
structure_key = HKDF(read_key,     info=b'sg-vault-v1:structure-key')
```

One-way properties hold: `structure_key` cannot be reversed to `read_key`; `read_key` cannot
be reversed to the passphrase or token.

### Encryption (Current State — INCOMPLETE)

⚠️ All vault objects are currently encrypted with `read_key`. The `structure_key` is derived
but never used for encryption — the feature is inert. This is the subject of the 04/28
Architect Review (see `proposed/structure-key-split.md`).

| Object | Currently encrypted with | Should use (target) |
|--------|--------------------------|---------------------|
| Refs | `read_key` | `structure_key` |
| Branch index | `read_key` | `structure_key` |
| Commits (core fields) | `read_key` | `structure_key` |
| Commits (`message_enc`) | `read_key` | `read_key` ✓ |
| Trees (outer envelope) | `read_key` | `structure_key` |
| Tree entries (`blob_id`, `tree_id`, `large`) | `read_key` | `structure_key` |
| Tree entries (`name_enc`, `size_enc`, `content_hash_enc`, `content_type_enc`) | `read_key` | `read_key` ✓ |
| Blob content | `read_key` | `read_key` ✓ |
| Public PKI keys | `read_key` | `structure_key` |
| Named branch private key | `read_key` | `write_key` (deferred) |

### Object Storage Model (bare/ structure)

Objects are stored in a content-addressable store (CAS) with opaque IDs:

| Object Type | Path Pattern | Mutability |
|-------------|-------------|------------|
| Blobs (file content) | `bare/data/obj-cas-imm-{hex_id}` | Immutable |
| Trees (directory snapshots) | `bare/data/obj-cas-imm-{hex_id}` | Immutable |
| Commits | `bare/data/obj-cas-imm-{hex_id}` | Immutable |
| Keys (PKI) | `bare/keys/key-rnd-imm-{hex_id}` | Immutable |
| Refs | `bare/refs/` | Mutable |
| Branch index | `bare/indexes/` | Mutable |

### Server-Side I/O — Auth Cache + Catch-404 Reads (v0.33.5, 2026-06-08)

| Behaviour | Status | Evidence |
|-----------|--------|---------|
| **Access-token validation cache** — positive `token_lookup` results cached for a Lambda-lifetime TTL (default 60s, `SGRAPH_SEND__TOKEN_CACHE_TTL`) so repeated writes/batches in a warm instance do **not** re-hit the Admin Lambda. Negatives never cached. Mirrors `_manifest_cache`. | **EXISTS** | `Service__Access_Token` (6 tests); used by `Routes__Vault__Pointer.check_access_token` + `Routes__Vault__Inbox._check_access_token` |
| **Catch-404 reads** — `Storage_FS__S3.file__bytes`/`file__str` do a single GetObject and catch the missing-key `ClientError` (return `None`) instead of a pre-`HeadObject`. `file__json` inherits it. `file__delete` unchanged (S3 delete is idempotent; its existence check is semantic). | **EXISTS** | `Storage_FS__S3._is_not_found` + tests in `test_Storage_FS__S3.py` |
| **No service-level pre-exists checks** — `Service__Vault__Pointer.read`/`_batch_read`/`_cas_write`/`write_if_match` rely on `file__bytes` returning `None` on miss (one read, not Head+read). | **EXISTS** | `test_Service__Vault__Pointer.py` (existing not-found cases still green) |
| **Write-key auth** — manifest loaded once per Lambda lifetime via `_manifest_cache`; warm writes do 0 S3 for auth, 1 PutObject for the object. | **EXISTS** | `Service__Vault__Pointer._load_manifest` |

> **Client-side commit batching — SHIPPED (was PROPOSED here):** the `sg-vault` browser library now collapses a commit's per-object/ref `PUT`s into one `POST /api/vault/batch`. See the **"Batched commit writes"** section below for the code-verified details. The note that this was "not yet used by the browser library" predates that change.

### Static-host mode — same vault app, no backend (2026-06-30)

| Behaviour | Status | Evidence |
|-----------|--------|---------|
| **`SGSend.staticMode`** — opt-in (constructor `{staticMode}` or global `window.SG_STATIC===true`; default **false** → live behaviour byte-identical). Lets the **same** vault-app HTML run against a plain static file host (GitHub Pages / S3) instead of the FastAPI: reads are deterministic GETs (file IDs are content-hash/HMAC of the key — no list/discovery call), writes reject with `EREADONLY`. | **EXISTS** | `sg-send.js`; `test__sgsend_static_mode.js` (12, incl. non-static regression guard); kernel bundle regenerated |
| **Batch-read fan-out** — in static mode `vaultBatch` (no `/batch` POST on a static host) fans `op:'read'` out to parallel `vaultRead` GETs and returns the **identical** `[{status,file_id,data:<b64>}]` shape, so `SGVaultObjectStore.batchLoad` (and any caller) is unchanged. A write op in a static batch → `EREADONLY`. `vaultReadLarge` skips presigned and reads directly; `vaultWrite`/`vaultDelete` → `EREADONLY`. | **EXISTS** | `sg-send.js` |
| Read-only open (no access token) → `sg.app.writable===false`; the bridge gates writes before the transport. So static = read-only snapshot; the app HTML is unchanged. | **EXISTS** | by construction (writable tier) |

Guide for the consuming team: `library/guides/vault-html/HOSTING-ON-STATIC-STORAGE.md` (GH Pages/S3 layout, `window.SG_STATIC`/`SG_ENDPOINT`, path-mirroring, cache headers, what works/doesn't). **PROPOSED follow-on:** configurable read-path template on `SGSend` so the static layout need not mirror the literal `/api/vault/read/<vaultId>/` prefix.

### Vault Round-Trip: AI-Native Access (v0.13.22)

| Capability | Status | Evidence |
|------------|--------|---------|
| `GET /vault/read-base64/{vault_id}/{file_id}` | **EXISTS** | Code in `Routes__Vault__Pointer.py`, 3 tests |
| `sgit clone/pull/push/status/init/commit/log/diff/branch` | **EXISTS** | PyPI: `sgit-ai`, GitHub: `SGit-AI/SGit-AI__CLI` |
| Claude as vault peer (read + write via CLI) | **VERIFIED** | Round-trip debrief v0.13.31 |
| SKILL.md self-bootstrapping | **VERIFIED** | New Claude session cloned vault, operated autonomously |
| Vault as async communication channel | **VERIFIED** | Human + Claude exchanged files bidirectionally |

**Known constraint:** Claude.ai bash_tool egress proxy blocks direct HTTP to `send.sgraph.ai`
unless domain is on allowlist. Domain allowlist changes only take effect in a new conversation.

### Vault Append — Append-Only Gate-Controlled Storage (v0.32.7)

Generic append-only storage primitive. Not messaging-specific — same infrastructure serves
logs, signals, control messages, state flows, and email-style workflows. The server stores
encrypted ciphertext and checks capability gates (`H(key) == stored_hash`). All crypto
(key derivation, encryption, decryption) is **client-side** — done in sgit CLI and vault web.

**Storage lives inside `bare/append/`** — managed by sgit but not in the commit DAG
(managed-but-unversioned). This preserves zero-knowledge while enabling sgit awareness.

| Capability | Status | Evidence |
|------------|--------|---------|
| Four-tier gate model (append_token, enum_key, write_key, private_key) | **EXISTS** | `Service__Vault__Append.py`, 133 tests |
| Blind append (no id/count leaked to sender) | **EXISTS** | `test__append__blindness_no_file_id_returned` |
| Paginated listing with cursor (`after_file_id`) | **EXISTS** | `test__list_entries__*` |
| Metadata-only listing (zero payload reads) | **EXISTS** | `test__list_entries__metadata_only_omits_size_and_content` |
| Copy+delete mark-processed (idempotent) | **EXISTS** | `test__mark_processed__*` |
| Path traversal defense via `Safe_Str__*` | **EXISTS** | 8 traversal negative tests |
| Batch operation cap (100 file_ids) | **EXISTS** | `test__*_rejects_oversized_batch` |
| Incremental content ceiling check (M-1 fix) | **EXISTS** | `test__list_entries__incremental_ceiling_check` |
| Separate append config — authoritative (L-2 fix) | **EXISTS** | `test__configure__writes_separate_config_file`, `test__configure__does_not_write_append_fields_to_manifest` |
| list_files never returns append entries | **EXISTS** | `test__list_files__never_returns_append_entries` |
| Account-less write surface (no access token) | **EXISTS** | `test__write__no_auth_token_required` |

**What lives where:**
- Server (SG/API): stores `H(enum_key)`, `H(append_token)`; gate checks; file storage; no crypto
- Client (sgit CLI / vault web): `enum_key` derivation, `append_token = H(pubkey)`, X25519 keygen,
  seal/open — all client-side. **Not SG/API work.**

See `send-api/index.md` for the 6 HTTP endpoints.

### Vault-App Vault Management — `sg.vault.*` create/manage (v0.33.5, 2026-06-08)

A vault app (sandboxed iframe under `/en-gb/app/`) can create and manage other vaults via the
kernel bridge, gated by `app.json` grants. Code: `app-shell.js` (`_createChildVault`,
`_ownerSecret*`, `_getVaultKey`, `_openAppVault`, `_listChildVaults`, `_deleteChildVault`,
`_seedVaultTree`), `app-permissions.js` (new vault grants), `sg-vault-owner-secrets.js` (new).

| Capability | Status | Evidence |
|------------|--------|---------|
| `sg.vault.create({returnKey})` returns the **composed** openable key `passphrase:vault_id` | **EXISTS** | `_createChildVault`; round-trip in tests |
| Standalone create (no parent-tree mutation) | **EXISTS** | `_createChildVault` (link omitted) |
| **Owner-secret store** — child write-keys sealed under a `write_key`-derived key at `.vault/owner/secrets/` (owner-tier; RO sessions cannot decrypt) | **EXISTS** | `SGVaultOwnerSecrets` (9 tests); `_ownerSecret*` |
| `sg.vault.getKey(ref)` / `openApp(ref)` / `list()` | **EXISTS** | bridge dispatch + helpers |
| `sg.vault.delete(ref)` — key custody solved; **server teardown pending** `SGVault.destroy()` | **PARTIAL** | `_deleteChildVault` returns `server_teardown:false` until the endpoint ships |
| `sg.vault.seedFrom` — copy a template tree into the new vault (skips `.vault/**`) | **EXISTS** | `_seedVaultTree`/`_collectTree` |
| **Embedded access token** — `create({accessToken:'inherit'\|'<token>'})` writes `.vault/access-token.json` (floored, read_key-encrypted) so a **key-only link opens WRITABLE**; token never in the URL. `accessToken:'new'` → ENOTIMPL (mint endpoint = separate workflow). `sg.vault.setAccessToken(ref,value)` rotates it. Embedded token wins over the localStorage cache at open. **Read on open by BOTH `/app` (app-shell) and `/vault` (vault-shell) — parity.** The reader expands the lazy `.vault` sub-tree (`needsLoading`/`loadSubTreeOnDemand`) before reading — `.vault` is `_loaded:false` after open, so `listFolder('/.vault')` returns `[]` and the token would be missed otherwise (this was the bug that kept the editor read-only). | **EXISTS** | `_readEmbeddedAccessToken`/`_writeEmbeddedAccessToken`/`_resolveEmbedToken`/`_setVaultAccessToken` (app-shell.js + vault-shell.js) |
| New grants: `vault.createKey`/`standalone`/`seedFrom`/`openApp`/`embedAccessToken` (default-deny; `createKey` stronger than `create`) | **EXISTS** | `app-permissions.js` (30 tests) |
| **Per-verb consent policy** — `app.json` `permissions.consent[verb]` = `always`/`once`/`auto`; tunes (never grants) the HUD confirmation. Default unchanged: always-confirm for createKey/delete. Lets a trusted app disable repeated prompts. | **EXISTS** | `_consentPolicy`/`_consent` |
| HUD consent banner ellipsizes (no overflow over title/buttons); message shortened, ref-id hidden | **EXISTS** | `app-hud.js` CSS |

### CLI Interop — branch index + reconcile-on-open (v0.33.5, 2026-06-08)

Closes two `sgit`-CLI-team briefs about web↔CLI two-ref-model interop.

| Fix | Status | Evidence |
|-----|--------|---------|
| Web vaults now write a single-branch index (`branch_index_v1`) at `bare/indexes/<idx-pid-muw-*>` on **create** and every **push** → `sgit clone <web-vault>` no longer errors "No branch index found" | **EXISTS** | `SGVaultRefManager.writeBranchIndex` (9 tests); called in `SGVault.create` + `push()` |
| `SGVault.open` reconcile-on-open: when the clone ref is **cleanly behind** the named ref (strict ancestor), load the **named** head, not the stale clone — fixes the "open prefers clone, silently shadows CLI pushes" bug | **EXISTS** | `sg-vault.js` open (`_isAncestor` clean-behind check); diverged/ahead clones keep their head (no data loss) |
| Branch-index path already aligned (`bare/indexes/`, not the CLI brief's feared `bare/idx/`) | **EXISTS** | `sg-vault-ref-manager.js` |

The web writes the index pointing at the **named** ref only (never the clone ref), so the CLI keeps cloning the canonical published branch. Brief responses: `team/comms/briefs/06/08/v0.33.5__brief__cli-interop-branch-index-and-reconcile.md`.

### Immutable-block caching in null-origin iframes (v0.33.5, 2026-06-08)

The Cache-API imm-block cache (`sg-vault-blocks`) is **inert in null-origin sandboxed iframes**
(the ViV kernel / embed context) — `caches`, `localStorage`, `indexedDB` all throw/are absent
there, so every imm read re-hit the network. Added a universal tier + HTTP-cache cooperation:

| Tier | Status | Notes |
|------|--------|-------|
| In-memory imm cache (module-level Map, 64 MB LRU) in `SGVaultObjectStore` | **EXISTS** | Works EVERYWHERE incl. null-origin; session-scoped; promotes Cache-API hits; content-addressed-safe. Tests: `test__object_store_mem_cache.js` (7) |
| Cache API tier (`sg-vault-blocks`) | EXISTS (unchanged) | Persistent where available; bypassed in sandboxes |
| `vaultRead` allows HTTP caching for `-imm-` GETs (keeps `no-store` for refs) | **EXISTS** | Browser HTTP cache survives reload even in null-origin (not storage-gated) |
| Server sends `Cache-Control: public, max-age=31536000, immutable` for `-imm-` reads (`no-store` for refs) | **EXISTS** | `Routes__Vault__Pointer.read__vault_id__file_id`; tests `test_Routes__Vault__Pointer.py` (+2) |

### Batched commit writes — one POST /batch instead of N preflighted PUTs (v0.33.5, 2026-06-08)

A commit/push emitted ~5 separate PUTs (blob, tree, commit, clone-ref, named-ref + index), each a
CORS-preflighted, unique-URL (uncacheable) request → ~half of a one-message send was OPTIONS rows.

| Change | Status | Evidence |
|--------|--------|---------|
| Transparent write-batch scope on `SGVaultObjectStore` (`beginBatch`/`flushBatch`/`discardBatch`/`batching`/`_stage`); `store()` stages when batching | **EXISTS** | `sg-vault-object-store.js`; tests `test__write_batch.js` (15) |
| `SGVaultRefManager.writeRef`/`writeBranchIndex` join the active batch (objectStore ref) | **EXISTS** | `sg-vault-ref-manager.js` |
| Re-entrant `SGVault._withBatch`; `_commit`, `create`, `push`, `addFile`/`addFiles`/`updateFile` wrapped → each logical write = ONE `POST /api/vault/batch/{vault_id}` | **EXISTS** | `sg-vault.js`, `sg-vault--sync.js`, `sg-vault--file-ops.js` |
| Ordering: objects → indexes → refs within the batch (a ref never precedes its target) | **EXISTS** | `flushBatch` sort; test asserts ordering |

Reuses the existing write-capable batch endpoint (`Service__Vault__Pointer.batch`); no backend change.
The fixed batch URL makes the single preflight cacheable. Architect spec + debrief:
`team/roles/architect/reviews/06/08/v0.33.5__architect-spec__batched-commit-writes.md`.
| `sg.vault.mount({mode:'rw'})` writable mount | **PROPOSED** | separate brief `team/comms/briefs/06/08/v0.33.5__brief__vault-writable-mount.md` |

Plan: `team/roles/dev/reviews/06/08/v0.33.5__dev-plan__vault-create-return-key.md`.

### Vault Inbox — C1 through C4 (v0.33.14–v0.33.16, 2026-06-09/10)

The inbox transport, check-on-events model, and app bridge are all shipped. The **full inbox spec** (CLI support, main UI section, app methods beyond the bridge) remains PROPOSED — see the PROPOSED section.

> **Rename (v0.32.7, 2026-06-15): `inbox` → `append`.** The transport was renamed across the stack —
> lib is now `_common/js/lib/sg-append/` (`sg-append.js`, `sg-append-checker.js`), the bridge namespace
> is **`sg.append.*`**, the write verb is **`write`** (was `append`), permission grants are
> `permissions.append.*`, and host events are `append.new-messages` / `append.error`. Recorded in
> `team/comms/changelog/06/15/v0.32.7__changelog__sg-inbox-client-append-url-migration.md`. The table
> below reflects the current (post-rename) names; the C1–C4 commit ids refer to the original
> pre-rename landing.

| Component | Status | Evidence |
|-----------|--------|---------|
| `sg-append.js` — append transport client; reads append objects from vault storage via raw pointer API; `read_key` raw-bytes getter for append objects | **EXISTS** | C1 (`ab62be8`, as `sg-inbox.js`); `tests/unit/vault_ui/loader/test__sg_append_client.js` |
| `sg-append-checker.js` — check-on-events model; polls/checks the append feed on trigger events; vault-shell triggers on receive | **EXISTS** | C2 (`7f19541`); `tests/unit/vault_ui/loader/test__sg_append_checker.js` |
| Host-events allowlist + `sg.on/off` event subscription API + append permission grants | **EXISTS** | C3 foundation (`a7a1239`); `tests/unit/vault_ui/loader/test__app_host_events.js`, `test__app_permissions__append.js` |
| Kernel→app event push: `_initAppendChecker` + `_pushHostEvent` in `app-shell.js`; checker runs on tab focus, pushes `append.new-messages` / `append.error` gated by `app.json host_events` allowlist | **EXISTS** | C3 kernel push (`bb41013`); `sg-append-checker.js` loaded in `en-gb/app/index.html` |
| `sg.append.*` transport bridge (request/response) in `/en-gb/app/` — verbs: `configure`, `write`, `list`, `fetch`, `markProcessed`, `purge`; `_getAppendClient()` per-vault transport helper; `sg.on/sg.off` event registry + `sg-event` receiver in iframe surface; RO sessions fail closed (null `enum_key`) | **EXISTS** | C4 (`a0c16c5`); `app-shell.js` `_buildVfsBridgeScript` (~line 2612) + `_setupVfsBridgeHandlers` (`__sgCmdType === 'append'`); `sg-append.js` loaded in `en-gb/app/index.html` |

The append transport uses the raw vault-pointer API (not the commit/push flow). Append objects live outside the version-controlled commit tree by design. End-to-end: app declares `permissions.append.*` + `host_events['append.new-messages']`, calls `sg.on('append.new-messages', cb)` — one line in app code.

---

### Open-as-App Auto-Refresh + Per-Folder app.json (v0.33.16, 2026-06-10)

Two connected bugs in the `/en-gb/app/` mount path fixed (`6583aca`):

| Fix | Status | Evidence |
|-----|--------|---------|
| **Auto-refresh keeps the opened file** — `_remountCurrent()` replays the persisted mount (`_mountStrategy`, `_effectiveAppJson`, `_mountedFilePath`) instead of re-running `_continue(root_manifest)`. `loadAllSubTrees()` called first so the entry is found. | **EXISTS** | `app-shell.js` `_remountCurrent`; `_checkBehind` calls it instead of `_continue` |
| **Per-folder app.json governs sub-folder apps** — `_resolveFolderAppJson(deepPath)` loads the folder's own `app.json` when a sub-folder HTML is opened as an app; folder-relative resources resolve via `AppNavHelpers.resolveFolderManifest`; permissions / host_events / auth / title come from the folder manifest, not the root vault manifest. Sub-folders without their own `app.json` fall back to existing behaviour. | **EXISTS** | `app-shell.js` `_resolveFolderAppJson`/`_setActiveManifest`; `app-shell-nav-helpers.js` `resolveFolderManifest`; `test__app_shell_nav_helpers.js` (now 56, +10 assertions) |

**Known limitation (out of scope):** The `app-shell:ready` HUD/auth intercept fires before the folder manifest is resolved — so `hud.*` config and `auth.required` still use the root manifest on first mount. Deferred.

### /vault Editor — Embedded Access Token (v0.33.16, 2026-06-10)

`vault-shell.js` now reads `.vault/access-token.json` on open (`_readEmbeddedAccessToken` helper), matching the existing `/app` behaviour (`f468ac5`):

| Fix | Status | Evidence |
|-----|--------|---------|
| `_onVaultOpened` reads the embedded access token after vault open when no explicit `accessKey` was provided and the vault is writable; token threaded onto `vault._sgSend.token` so subsequent writes carry `x-sgraph-access-token` immediately | **EXISTS** | `vault-shell.js` `_readEmbeddedAccessToken` / `_onVaultOpened` |

Consequence: vaults created with `create({ accessToken:'inherit' })` now open WRITABLE in both `/vault` and `/app` from the same key-only link. Previously `/vault` opened read-only while `/app` opened writable.

---

### `/app` Auto-Sync Parity (v0.33.5, 2026-06-08)

`/en-gb/app/` (app-shell.js) now has the auto-sync engine `/vault` already had — previously
it had neither auto-push nor auto-pull, so app writes committed to the working clone but never
pushed → the clone diverged from the named ref → "↑N to push" on return to `/vault` + stale code
on `/app` refresh (a diverged clone can't fast-forward).

| Capability | Status |
|------------|--------|
| Debounced auto-push of app writes (`sg.fs.write`/`fs.*`) — coalesces a burst ~2.5s after the last write | **EXISTS** (`_scheduleAutoPush`/`_autoPushNow`) |
| Auto-pull on tab focus + 1.5s after mount — fast-forwards a clean-behind clone + remounts the app | **EXISTS** (`_scheduleBehindCheck`/`_checkBehind`) |
| Shared `localStorage['sg-vault-autosync']` flag governs BOTH `/app` and `/vault` | **EXISTS** |
| Persistent HUD warning when unpushed + (auto-sync off / diverged / push-failed) | **EXISTS** (`_surfaceUnpushed`) |
| `seedFrom` now pushes the child's named ref so seeded content is visible to other openers | **EXISTS** (fix) |

Brief: `team/comms/briefs/06/08/v0.33.5__brief__app-vault-sync-parity.md`.

---

## DOES NOT EXIST (Commonly Confused)

| Claimed | Reality |
|---------|---------|
| `structure_key` used for encryption | PROPOSED — derived but never used currently |
| `GET /api/vault/bundle/{vault_id}` (single-call clone) | PROPOSED |
| MCP transport backend for sgit | PROPOSED |
| Merge and conflict resolution | PROPOSED — architecture simulated, no code |
| Nested vaults (vault-inside-vault) | PROPOSED |
| SQLite as local vault storage backend | PROPOSED — future optimisation |

---

## PROPOSED

Key proposals for this domain. Full details: see sub-files in `proposed/`.

- **Structure key encryption split** — activate `structure_key` for structural objects (four-team, 04/28 review) → `proposed/structure-key-split.md`
- **Vault architecture overhaul** — self-describing file IDs, sub-tree model, batch read API → `proposed/vault-architecture.md`
- **SG Vault Hub** — GitHub-equivalent for encrypted vaults, change packs, public view publishing → `proposed/vault-hub.md`
- **Vault browser UI** — auto-commit, auto-sync, history visualisation, in-browser editing → `proposed/vault-browser-ui.md`
- **PKI Modes 2–4** — device provenance, author-identified, countersigned (Mode 1 exists) → `proposed/pki-modes.md`
- **Vault migration / multi-remote** — pull from multiple remotes, migration tooling → `proposed/multi-remote.md`
- **Named branch private key re-keying** — move from `read_key` to `write_key` (deferred, low current impact) → `proposed/structure-key-split.md`
- **Vault Append client crypto (P1/P2 from briefing pack v0.32.1)** — HKDF derivations (`enum_key`, `append_token = H(pubkey)`), X25519 keygen, seal/open, cross-language KAT suite. **This is client-side work (sgit CLI + vault web), not SG/API server work.** The server's P0 (storage + gates) is done; the remaining phases belong to the vault client repos.
- **P-227: Vault-per-user as SG/Send storage substrate** — PROPOSED: one vault per user for SG/Send; SG/Sentinel rules write user activity to their vault; removes backend complexity; zero-knowledge nuance preserved (activity visible, content unseen). Requires SG/Sentinel deployed. Source: doc 468, 05/24 briefs.
- **Sub-Vaults via Web UI (Phases 1–3)** — EXISTS as of 05/25–26: `.link.json` convention files + ro-links owner records; link card UI (Phase 2); owner "Add link" UI (Phase 3); portable ro-links (open on any device); lazy-load (preserve open folders); sub-vault reads/lists via app bridge. Implements P-231 for the Web UI access point. CLI access remains PROPOSED (P-248).
- **P-248: Sub-vaults CLI access (clone-within-clone)** — PROPOSED: sgit CLI path for sub-vaults — track storage locations, resolve nested clones step by step. Deferred; Web UI prioritised first. Source: doc 490, 05/25 briefs.
- **Vault Inbox Full Spec** — PROPOSED: CLI commands (`sgit inbox list/read/accept-key`), main UI section (left-hand, refresh-checked, message count + key ID + config view), vault-app inbox methods (`sg.inbox.read()` under permission mapping), accepted-key configuration per vault. Email-FS-lite primitive. Source: `briefs/06/07/v0.32.7__dev-brief__sg-send-vault-inbox-cli-ui-app-public-key-controlled.md`. Foundation shipped (C1/C2/C3 — see EXISTS above).
- **Deterministic Value Indexes** — PROPOSED: index files at `bare/indexes/val-{sha256(value)}` where the hash is computed from the value (e.g. an email, a name), not the key. Requesting the file answers existence; reading it answers location (object ID + metadata). Derived from the value, not the key — the novel element. Enables hash-based existence check for large-file deduplication. Source: `briefs/06/07/v0.32.7__arch-brief__sg-send-deterministic-value-indexes-finding-in-encrypted-store.md`.
- **PKI Public Key Registry** — PROPOSED: a vault that stores public keys + trust relationships (graph database); two-level trust (downward explicit: A trusts B; upward self-declared: B says A should trust it); clues not storage; federation across registries; caller-side resolver with graded partial results. Replaces a prior FastAPI prototype. Source: `briefs/06/05/v0.32.4__dev-brief__sg-send-pki-public-key-registry-on-vaults.md`.
- **Large-File Chunked Vault Upload** — PROPOSED: 100% vault upload workflow for large files (live case: 15 GB); `file.slice()` streaming chunks; SHA-256 per chunk; existence check via deterministic value index; resumable upload; recipient loads vault structure without downloading data; selective chunk download; video slices (FFmpeg) + first-frame thumbnails. Source: `briefs/06/07/v0.32.7__dev-brief__sg-send-large-file-sharing-chunked-upload-ui.md`.
- **Central Key Management / OpenRouter Distribution** — PROPOSED: parent vault manages OpenRouter key centrally; distributes to child vaults via vault-to-vault comms inbox; children use key for in-vault LLM capabilities (infographics, chat); return results to parent over comms. Per-child billing + credit allocation. Source: `briefs/06/07/v0.32.7__dev-brief__sg-send-central-key-management-openrouter-keys-to-child-vaults.md`.

---

## Sub-files

- `proposed/structure-key-split.md` — 04/28 architect review content (the active four-team change)
- `proposed/vault-architecture.md` — self-describing IDs, sub-tree model, storage backends
- `proposed/vault-hub.md` — SG Vault Hub, change packs, public view
- `proposed/vault-browser-ui.md` — auto-commit, auto-sync, history viz, in-browser editing
- `proposed/pki-modes.md` — PKI Modes 2–4, key rotation, YubiKey/TPM
- `proposed/multi-remote.md` — vault migration, multi-remote

*When this index exceeds ~300 lines, create: `crypto.md`, `storage.md`, `browser-js.md`, `pki.md`*
