# 06 — Reuse Map: Existing `__Send` Modules vs Build-New

**version** v0.27.62
**date** 25 May 2026
**from** Developer (lead)
**to** implementing agent, Architect
**source** code-verified against `SGraph-AI__App__Send` on 25 May 2026 (paths below are real; verify they still exist before importing)

Public Vault Previews is **not green-field**: the crypto, the SG/Send transfer flow, **the transfer delete**, and expiry all exist and are tested. The new code is a thin derive/schema/read/write module plus two-to-three small components. Legend: **REUSE** (import/port unchanged) · **EXTEND** · **BUILD NEW**.

> **Path roots.** Vault frontend: `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/` (abbreviated `VAULT/`). Share frontend (crypto + transfer client precedent): `sgraph_ai_app_send__ui__share/v0/v0.4/v0.4.0/en-gb/` (abbreviated `SHARE/`). Backend: `sgraph_ai_app_send/lambda__user/` (abbreviated `LAMBDA/`).

---

## A. Backend transfer flow + delete + expiry — REUSE (nothing to build)

| Building block | Verb | Exact path | What it gives you |
|---|---|---|---|
| `create` / `upload` / `complete` / `download-base64` | **REUSE** | `LAMBDA/fast_api/routes/Routes__Transfers.py:21-29,87-216` | The full publish + read flow. `download-base64` is the public read path (returns `{transfer_id, data:base64(cipher), file_size_bytes}`). |
| `DELETE /api/transfers/delete/{id}` | **REUSE** | `Routes__Transfers.py:249-260` | Sender-controlled hard delete via `x-sgraph-transfer-delete-auth` header. The update/unpublish path. |
| Delete-auth model + expiry fields | **REUSE** | `LAMBDA/service/Transfer__Service.py:57-99` (`create_transfer`), `:174-192` (`delete_transfer`), `:151-170` (expiry/limit enforcement) | `delete_auth_hash`, `expires_at`, `max_downloads`, `auto_delete` are accepted at create and enforced on download. |
| Create request schema | **REUSE** | `LAMBDA/schemas/Schema__Transfer.py:16-23` | The exact create fields: `file_size_bytes`, `content_type_hint`, `transfer_id`, `max_downloads`, `auto_delete`, `expires_at`, `delete_auth_hash`. |
| Transfer-id format constraint | **HONOUR** | `Transfer__Service.py:44` | `^[a-f0-9]{12}$` — the derivation MUST emit 12 lowercase hex chars (doc 03 §1.1). |

**Auth note (resolves the upstream Q-thumb-auth):** `create`/`upload`/`complete` call `check_access_token` (need the owner's `x-sgraph-access-token`) — fine, publishing is an owner action. **`download`/`download-base64` do NOT check a token** (`Routes__Transfers.py:167,194`) — so the public read path is tokenless, exactly as needed.

---

## B. Crypto + transport (frontend) — REUSE / PORT

| Building block | Verb | Exact path | What it gives you |
|---|---|---|---|
| `SendCrypto.encryptFile / decryptFile / importKey / exportKey` | **REUSE/PORT** | `SHARE/_common/js/crypto.js:15-106` | IV-prepended AES-GCM (`IV(12) ‖ ciphertext`) — the exact wire format the read path decrypts and the write path produces. |
| `UploadConstants.packageWithMetadata` (SGMETA envelope) | **REUSE/PORT** | `SHARE/_common/js/components/send-upload/upload-constants.js:78-91` | `SGMETA[6] ‖ len[4 BE] ‖ json ‖ content`. The read path unwraps it; the write path wraps the preview JSON. |
| 3-step upload engine | **REUSE as reference** | `SHARE/_common/js/components/send-upload/upload-engine.js` | The `create → upload → complete` driver; mirror its call sequence in `public-preview-write.js`. |
| `deleteTransfer()` client | **REUSE as reference** | `SHARE/_common/js/api-client.js` and `…__ui__open/v0/v0.4/v0.4.0/en-gb/_common/js/api-client.js` | Already issues `DELETE /api/transfers/delete/{id}` with the delete-auth header — copy the call shape for `updatePreview`/`unpublishPreview`. |
| Open-UI URL contract (the transparency "open raw file" link) | **REUSE (build link)** | `…__ui__open/v0/v0.4/v0.4.0/en-gb/_common/js/components/send-download/send-download.js:107-134` | The open UI parses `#<transferId>/<key>` (route modes `/view` `/download` `/browse` `/gallery`). The card's "How this works" disclosure builds `send.sgraph.ai/en-gb/open/view#<transferId>/<readKeyB64url>` (doc 02 §9, doc 04 §6a). |
| `FriendlyCrypto.deriveTransferId / deriveKey` | **REUSE pattern, NOT the function** | `SHARE/_common/js/friendly-crypto.js:18-70` | The proven `SHA-256[:12]` transfer-id + `PBKDF2(salt='sgraph-send-v1',600k)` AES-key pattern. The new derive copies the *shape* with a **distinct salt + transfer-id prefix** (doc 03 §1) — do NOT call it directly (see §F). |

> Decide per the IFD rules whether the read path **imports** `SendCrypto`/`UploadConstants` from a shared location or **ports** the ~40 lines into the `sg-public-preview` module to keep the public page dependency-light. Recommendation: port the decrypt + SGMETA-unwrap into the module (read path stays self-contained); reuse `SendCrypto.encryptFile` in the write path.

---

## C. Vault client (owner bookkeeping) — REUSE

| Building block | Verb | Exact path | What it gives you |
|---|---|---|---|
| `SGVaultCrypto.deriveKeys` / `deriveKeysFromSimpleToken` | **REUSE** | `VAULT/_common/js/lib/sg-vault/sg-vault-crypto.js:55-175` | Open the owner vault (Mode A/B real-key open). Salts: read `sg-vault-v1:{id}`, write `sg-vault-v1:write:{id}`; simple-token PBKDF2 `sgraph-send-v1` → HKDF `vault-read-key`/`vault-write-key`. |
| `SGVault` open + tree + file read/write | **REUSE** | `VAULT/_common/js/lib/sg-vault/sg-vault.js` | Open the owner vault and read/write the bookkeeping file `.sgraph/public-previews/<public-id>.json` (doc 03 §4). |
| `vault-credentials.js` parse/resolve | **REUSE** | `VAULT/en-gb/vault/token/vault-credentials.js:27-62` | Parse the `#`-fragment vault key (vault key / RO token / simple token) for the Mode A/B open. |
| `vault-hkdf.js` (`ownerEncrypt`/`ownerDecrypt`) | **REUSE if double-encrypting bookkeeping** | `VAULT/en-gb/vault/token/vault-hkdf.js:25/61/79` | Owner-tier double encryption (info `sgraph-vault-secret-v1`) — optional extra protection for the `delete_auth` in bookkeeping. |

These are used **only** by `public-preview-write.js` (owner path) — the public read path must not import them, to keep the public page light.

---

## D. Component scaffolding — REUSE

| Building block | Verb | Exact path | What it gives you |
|---|---|---|---|
| `VaultComponent` base class | **REUSE** | `VAULT/_common/js/base/vault-component.js:8-40` | The base Web Component (`extends HTMLElement`) for all new components — shadow DOM, resource loading, lifecycle. **This repo's base is `VaultComponent`, not `SgComponent`.** |
| `design-tokens.css` | **REUSE** | `VAULT/_common/css/design-tokens.css` | Theme tokens for card + editor surfaces. |
| `app-shell` (the `/en-gb/app` host) | **EXTEND** | `VAULT/en-gb/app/index.html` + `<app-shell>` | The existing app page that parses `#<vault-key>` and mounts the vault app. Extend it to read the public-id path segment (or `?p=`) and mount `sg-public-preview-card` first. |
| `sg-app-banner` | **REUSE as reference** | `VAULT/_common/js/components/sg-app-banner/sg-app-banner.js` | App Mode activation + "Loading…" overlay pattern — a model for the preview skeleton/loading state. |
| `vault-upload` | **REUSE as reference** | `VAULT/_common/js/components/vault-upload/vault-upload.js` | File selection pattern for the editor thumbnail picker (the v0.1.2 `vault-upload-dropzone` was not carried into v0.2.3 — model the picker on `vault-upload` or lift the dropzone forward). |
| Native thumbnail encode (no libs/wasm) | **BUILD NEW (tiny, native)** | Web platform: `createImageBitmap` + `<canvas>`/`OffscreenCanvas` + `canvas.toBlob('image/webp', q)` | Downscale + WebP re-encode + EXIF-strip for the thumbnail. **No external library, no wasm** — all Web Crypto/Canvas built-ins. Both the upload source and the "pick from a vault file" source feed this. |
| Read a vault file as the thumbnail source | **REUSE** | `VAULT/_common/js/lib/sg-vault/sg-vault.js` (file read) | The editor's "pick from the vault" path reads + decrypts a chosen file from the owner's open vault, then runs the native encode above. |

---

## E. The new module + components — BUILD NEW

### E.1 Core module `VAULT/_common/js/lib/sg-public-preview/`

| File | Responsibility |
|---|---|
| `public-preview-crypto.js` | `derivePublicPreviewKeys(publicId)` → `{transferId, readKeyRO, readKeyBytes}`; PBKDF2 salt `sgraph-public-preview-v1`; transfer-id `SHA-256('pvp-transfer-v1:'+id)[:12]`; read key imported **decrypt-only**. Doc 03 §1. |
| `public-preview-schema.js` | `validatePreview`, `emptyPreview`, `PREVIEW_SCHEMA_VERSION=1`; id-format validator + Simple-Token-regex rejection; inline `write_key`/`read_key`/`passphrase` ban. Doc 02 §5. |
| `public-preview-read.js` | `fetchPreview(apiBase, publicId)`: derive → `GET download-base64/<tid>` → base64-decode → strip IV → AES-GCM decrypt → strip SGMETA → `validatePreview`. **No vault deps.** |
| `public-preview-write.js` | `publishPreview` / `updatePreview` / `unpublishPreview`: random `delete_auth`; `SendCrypto.encryptFile` + SGMETA + 3-step upload (`create` with `delete_auth_hash`/expiry); `DELETE` on update/unpublish; bookkeeping via `SGVault`. Doc 03 §3-4. |

### E.2 Components `VAULT/_common/js/components/`

| Component | Role |
|---|---|
| `sg-public-preview-card` | Public page surface (all Mode A/B states, mockups §1-4). Imports only the read path + tokens. Extends `VaultComponent`. |
| `sg-public-preview-editor` | Edit/publish UX (mockups §5-8). Reuses the thumbnail picker + the field-name guard; calls the write path. Extends `VaultComponent`. |
| `sg-public-preview-meta` | Injects OG/Twitter `<meta>` from the JSON (client path — humans). Crawlers use the Lambda OG route (§G). |

### E.3 Backend OG-render route — BUILD NEW (in-repo)

| File | Role |
|---|---|
| New route on the public User Lambda | `LAMBDA/fast_api/routes/Routes__Public_Preview.py` (or extend an existing static/app route): on a crawler GET to `/en-gb/app/<public-id>` (or `/og/<public-id>`), Python-port the derive (doc 03 §1), `GET` the transfer, AES-GCM-decrypt the public preview, inject OG tags into the shell, cache by public-id, **fail closed**. Doc 02 §6. |

---

## F. What NOT to reuse (anti-coupling)

- **Do NOT call `FriendlyCrypto.deriveTransferId` / `deriveKey`.** They are the **Simple Token** derivation (salt `sgraph-send-v1`, regex `^[a-z]+-[a-z]+-\d{4}$`). The brief is explicit: this is NOT a Simple Token. The new derive copies the *shape* with a **distinct salt + `pvp-transfer-v1:` id prefix** (doc 03 §1.3) so the namespaces are provably separate.
- **Do NOT reuse the vault-key derivation** (`SGVaultCrypto.deriveKeys`, salt `sg-vault-v1:<id>`) for the public key. Different secret, salt, info — keep apart (R3).
- **Do NOT derive `delete_auth` from the public string.** It must be a random owner-held secret (doc 03 §3.3, doc 09 R-deface) — otherwise anyone with the public-id can delete + deface the preview.
- **Do NOT import the vault client (`SGVault`/`SGVaultCrypto`) in the public read path.** Owner-only (bookkeeping). The public page must stay light.

---

## G. Items the upstream `__Tools` pack assumed that DO NOT exist here

| Upstream assumption | Reality in `__Send` | What to do instead |
|---|---|---|
| `sg-vault-manifest` recursive `write_key` guard (`containsWriteKey`/`WRITE_KEY_ERROR`) | **Absent** | Build a tiny inline scan in `public-preview-schema.js` (reject any field literally `write_key`/`read_key`/`passphrase`). |
| `SgComponent` base class | **Absent** (it's `VaultComponent`) | Extend `VaultComponent`. |
| `SgToolApi` + 3-file SKILL (`SKILL-human/browser/api.md`) tool pattern | **Absent in the vault UI** (tool API is at the Lambda/MCP level; agent SKILLs live in `library/skills/`) | No SgToolApi dependency. If a dev/demo harness is wanted, follow `VAULT/en-gb/vault/peek/index.html`. |
| `core/.../vN/vN.M/vN.M.K/` layout | This repo nests by **product UI package** then IFD version (`…__ui__vault/v0/v0.2/v0.2.3/_common/js/...`) | Use the `VAULT/`/`SHARE/` roots above. |

---

## H. Mapping summary

| Surface | Primary source(s) |
|---|---|
| public-id → transfer-id + read-only key | **NEW** `public-preview-crypto.js` (PBKDF2/SHA-256 *pattern* from `friendly-crypto.js`, distinct salt + id prefix) |
| fetch + decrypt + validate | **NEW** `public-preview-read.js` + PORT `SendCrypto` decrypt + SGMETA unwrap |
| publish / update / unpublish | **NEW** `public-preview-write.js` + REUSE `SendCrypto.encryptFile` + SGMETA + transfer `create/upload/complete` + `DELETE` |
| owner bookkeeping | REUSE `SGVault` + `SGVaultCrypto` (+ optional `vault-hkdf` double-encryption) |
| public page surface + states | **NEW** `sg-public-preview-card` + REUSE `VaultComponent` + tokens |
| edit UX | **NEW** `sg-public-preview-editor` + REUSE thumbnail picker + inline field-name guard |
| OG meta (humans) | **NEW** `sg-public-preview-meta` |
| OG meta (crawlers) | **NEW** in-repo `Routes__Public_Preview.py` on the User Lambda |
| `/app/<public-id>` route | **EXTEND** existing `VAULT/en-gb/app/index.html` + a CloudFront routing rule **or** CF Function serving the shell for `/en-gb/app/*` (wired day one — doc 02 §4.3) |
| transfer + delete + expiry backend | **REUSE** (already exists) |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
