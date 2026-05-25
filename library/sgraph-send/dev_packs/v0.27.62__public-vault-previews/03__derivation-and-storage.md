# 03 — Derivation & Storage: Deterministic ID and the Update/Delete Flow

**version** v0.27.62
**date** 25 May 2026
**from** Architect
**to** Developer (lead), Security
**source** `01__brief` (corrections 1–3) · `friendly-crypto.js` · `sg-vault-crypto.js` · `Routes__Transfers.py` · `Transfer__Service.py` · `Schema__Transfer.py` (all code-verified in `__Send`, 25 May 2026)

---

## 1. The deterministic derivation (public-vault-about-key → transfer-id + read-only key)

The proven precedent in this repo is `FriendlyCrypto` (`sgraph_ai_app_send__ui__share/v0/v0.4/v0.4.0/en-gb/_common/js/friendly-crypto.js`), which derives a transfer-id and an AES key from a friendly token:

```js
// EXISTING — FriendlyCrypto (the pattern we mirror)
deriveTransferId(token) = SHA-256(token)[:12 hex]
deriveKey(token)        = PBKDF2(token, salt='sgraph-send-v1', 600000, SHA-256) → AES-GCM
```

The public-preview derivation **mirrors this shape** but uses a **distinct domain-separation salt and a distinct transfer-id namespace**, so the public-preview key is provably unrelated to both Simple Tokens (`sgraph-send-v1`) and vault keys (`sg-vault-v1:<id>`). The public string is **NOT a Simple Token** and is not constrained to `word-word-NNNN`.

### 1.1 `derivePublicPreviewKeys(publicId)` — proposed

Lives in `…/_common/js/lib/sg-public-preview/public-preview-crypto.js`.

```js
const PREVIEW_PBKDF2_SALT = 'sgraph-public-preview-v1';   // distinct from 'sgraph-send-v1' and 'sg-vault-v1:*'
const PREVIEW_ITERATIONS  = 600000;                        // same cost as FriendlyCrypto / SGVaultCrypto
const TRANSFER_ID_PREFIX  = 'pvp-transfer-v1:';            // domain-separates the id from FriendlyCrypto's bare SHA-256(token)

/**
 * Derive the public-preview transfer-id and a READ-ONLY AES key from a public string.
 * Produces NO write key and NO delete_auth.
 * @param {string} publicId  normalised lowercase, trimmed
 * @returns {Promise<{ transferId: string, readKeyRO: CryptoKey, readKeyBytes: Uint8Array }>}
 */
export async function derivePublicPreviewKeys(publicId) {
  const enc = new TextEncoder();
  const id  = publicId.toLowerCase().trim();

  // (a) transfer-id — SHA-256 over a DOMAIN-SEPARATED input → first 12 hex chars.
  //     Matches Transfer__Service.TRANSFER_ID_PATTERN = ^[a-f0-9]{12}$.
  const tHash = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(TRANSFER_ID_PREFIX + id)));
  let transferId = '';
  for (let i = 0; i < 6; i++) transferId += tHash[i].toString(16).padStart(2, '0');

  // (b) read key — PBKDF2 with the PUBLIC-PREVIEW salt → raw 256-bit → AES-GCM.
  const material = await crypto.subtle.importKey('raw', enc.encode(id), 'PBKDF2', false, ['deriveBits']);
  const readKeyBytes = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(PREVIEW_PBKDF2_SALT), iterations: PREVIEW_ITERATIONS, hash: 'SHA-256' },
    material, 256));

  // (c) import DECRYPT-ONLY so the read path literally cannot encrypt new content.
  const readKeyRO = await crypto.subtle.importKey('raw', readKeyBytes, { name: 'AES-GCM' }, false, ['decrypt']);

  return { transferId, readKeyRO, readKeyBytes };   // readKeyBytes only used by the WRITER to re-import as ['encrypt']
}
```

### 1.2 What is and is NOT produced

| Produced | Not produced |
|---|---|
| `transferId` (12 hex — fits `^[a-f0-9]{12}$`) | any **write key** — the public string yields no write capability |
| `readKeyRO` (AES-256-GCM, imported **decrypt-only**) | any **vault read/write key** (different salt `sg-vault-v1:<id>`) |
| `readKeyBytes` (only the writer re-imports with `['encrypt']` to publish) | any **`delete_auth`** — that is a separate random secret (§3) |

The read path imports the key **decrypt-only**, so the public page cannot encrypt. The writer (`public-preview-write.js`) re-imports `readKeyBytes` with `['encrypt']` to publish — but the writer is the *owner*. **No write capability and no delete capability leak from the public string.**

### 1.3 Why this is provably a separate namespace (R3)

- **Different PBKDF2 salt** (`sgraph-public-preview-v1`) from Simple Tokens (`sgraph-send-v1`, `friendly-crypto.js:20` / `sg-vault-crypto.js`) and vaults (`sg-vault-v1:<id>` / `sg-vault-v1:write:<id>`, `sg-vault-crypto.js`). The same input fed to the three derivations yields three unrelated 256-bit values.
- **Different transfer-id input** (`pvp-transfer-v1:` prefix) from `FriendlyCrypto.deriveTransferId` (bare `SHA-256(token)`), so a Simple Token and a public-id with the same text map to **different** transfer-ids — no accidental collision with a real share.
- The public-preview key can decrypt **only** the public preview blob. It is mathematically unrelated to the vault `read_key` (derived from a *secret* passphrase + a *different* salt). Full argument: doc 09 R3. **Security must run a known-answer test** confirming the three derivations differ for the same input string.

---

## 2. Public-ID format rules and collision handling

| Rule | Value |
|---|---|
| Charset | `[a-z0-9-]` (lowercase alphanumeric + hyphen); no leading/trailing/double hyphen |
| Length (custom) | 4–63 chars (DNS-label-friendly, readable: `vault-demo-health-data`, `mvp-demo-x`) |
| Length (random) | 16 chars from a 32-symbol base (~80 bits) when system-generated |
| Normalisation | `toLowerCase().trim()` before derivation (matches §1.1) |
| Reserved | reject ids matching the Simple-Token regex `^[a-z]+-[a-z]+-\d{4}$` so the two concepts never visually collide |

**Collision handling.** The id maps deterministically to a 12-hex transfer-id; the backend already enforces uniqueness — `create_transfer` returns `transfer_id_exists` (HTTP 409) if the id is taken (`Transfer__Service.py:66-67`, `Routes__Transfers.py:101-102`). So:
- **Random ids** (~80 bits → 12-hex/48-bit transfer space): birthday collisions are negligible. On the rare 409 at create, regenerate and retry.
- **Custom ids:** on publish, the writer attempts `create`. A 409 means the derived transfer already exists. If the owner **holds its `delete_auth`** in their vault bookkeeping (§4), this is an **update** (§3) — not a collision. Otherwise the readable name is **taken by someone else**; the editor surfaces "this public id is taken — choose another." First-come-first-served on readable names, exactly as for any human-chosen-string namespace.

---

## 3. The update / delete flow (correction 3 — RESOLVED: delete is implemented)

> **⚠ BLOCKER found during implementation (25 May, verified by test).** DELETE exists, but its semantics block in-place recreate: `delete_transfer` removes the payload yet **leaves a `status:'deleted'` metadata tombstone**, so `create_transfer` at the same id returns `transfer_id_exists` (409), and `upload_payload` rejects a non-`pending` transfer. **So "delete-then-recreate at the same transfer-id" does NOT work as-is.** Verified in `tests/unit/lambda__user/service/test_Transfer__Service__public_preview.py::test__recreate_after_delete_is_blocked_by_tombstone`. First-publish, read, and unpublish all work; only the in-place **update** (same share link) is blocked. Resolution options (needs a project-lead/backend decision): **(A)** a small backend tweak so a deleted id can be recreated (delete also clears the meta, or create overwrites a `deleted` meta); **(B)** versioned public-id (link changes on edit); **(C)** store the preview via the vault **pointer API** mutable ref (`PUT /api/vault/write`, overwrite-in-place; tokenless read), with a random owner-held write key (not derived from the public string). See doc 08 Q-update-blocker.

### 3.1 Finding: transfer **bytes** are write-once, but **DELETE exists** (with sender-held auth)

The transfer lifecycle is `create` → `upload` → `complete`; once completed, the bytes are fixed (`Transfer__Service.upload_payload` only accepts `status == 'pending'`, line 95). **But this repo also implements a sender-controlled hard delete:**

```
DELETE /api/transfers/delete/{transfer_id}        # Routes__Transfers.py:249
   header: x-sgraph-transfer-delete-auth: <delete_auth>
```

`delete_transfer(transfer_id, delete_auth)` (`Transfer__Service.py:174`): the transfer's metadata stores `delete_auth_hash = SHA-256(delete_auth)` (set at **create** time — `Schema__Transfer.py:23`, stored line 83). On delete the server checks `SHA-256(submitted) == stored_hash`; on match it wipes the payload and sets `status='deleted'`. Error codes: `404 not_found`, `409 delete_not_enabled` (no hash stored), `403 auth_mismatch`. **So delete is gated on a secret (`delete_auth`) that only the creator chose** — the server stores only its hash.

### 3.2 The shipping update flow — delete-then-recreate (no fallback needed)

```
publishPreview(ownerVault, publicId, previewJson, apiBase, accessToken, expiry):
  { transferId, readKeyBytes } = derivePublicPreviewKeys(publicId)
  encKey      = importKey(readKeyBytes, ['encrypt'])
  delete_auth = randomSecret()                                   // 32 random bytes, base64url — NOT from publicId
  envelope    = packageWithMetadata(utf8(JSON.stringify(previewJson)), { filename: 'preview.json' })   // SGMETA (reuse)
  cipher      = SendCrypto.encryptFile(encKey, envelope)         // IV(12) ‖ ciphertext (reuse)
  POST /api/transfers/create   { transfer_id: transferId, file_size_bytes, content_type_hint,
                                 delete_auth_hash: SHA-256(delete_auth),
                                 expires_at, max_downloads, auto_delete }     // header: x-sgraph-access-token
  POST /api/transfers/upload/{transferId}    (cipher)
  POST /api/transfers/complete/{transferId}
  writeBookkeeping(ownerVault, publicId, { transferId, delete_auth, expiry, version, apiBase })   // §4

updatePreview(ownerVault, publicId, newJson, ...):
  bk = readBookkeeping(ownerVault, publicId)                     // delete_auth from the OWNING vault
  DELETE /api/transfers/delete/{bk.transferId}   header: x-sgraph-transfer-delete-auth: bk.delete_auth
  publishPreview(ownerVault, publicId, newJson, ...)             // recreate at the SAME transfer-id, same share link

unpublishPreview(ownerVault, publicId):
  bk = readBookkeeping(ownerVault, publicId)
  DELETE /api/transfers/delete/{bk.transferId}   header: x-sgraph-transfer-delete-auth: bk.delete_auth
  markBookkeepingInactive(ownerVault, publicId)
```

The owner **persists the random `delete_auth` at create time** (correction 3), inside the owning vault (§4), so a later edit on **any device** can pull it, delete, and recreate at the same transfer-id — meaning **the share link never changes across edits.**

### 3.3 The one hard security gate — `delete_auth` MUST be random, NEVER derived from the public string

It is tempting to derive `delete_auth` from the public-vault-about-key (then no bookkeeping is needed). **Do not.** If `delete_auth` were derivable from the public string, **anyone who knows the public-id could delete the preview and recreate it with their own content** — defacement / phishing under the owner's link (doc 09 R-deface, NO-GO). The whole point of the random owner-held secret is that the public layer is **read-only to the world and writable only by the owner.** This is the precise realisation of the project lead's "we hold the delete key."

### 3.4 Recommendation

1. **Ship publish/read on the existing 3-step transfer flow** (correction 2 — no new endpoint).
2. **Ship `updatePreview` as delete-then-recreate from day one** (delete exists), with the random owner-held `delete_auth`.
3. **Set `expires_at` / `max_downloads` / `auto_delete` at create** when the owner chooses expiry (§ doc 02 §7) — both expiry dimensions are server-enforced.
4. **Never derive `delete_auth` (or any write/delete capability) from the public string** (§3.3, doc 09 R-deface).

---

## 4. Where the owning vault stores the bookkeeping

The owner already has a zero-knowledge vault; that is the right place for the private bookkeeping (public-id ↔ transfer-id ↔ delete_auth ↔ expiry). Convention path **inside the owner's vault** (encrypted like any vault file):

```
.sgraph/public-previews/<public-id>.json
```

Shape:

```json
{
  "schema": "sgraph-public-preview-bookkeeping/v1",
  "public_id": "vault-demo-health-data",
  "transfer_id": "a1b2c3d4e5f6",
  "delete_auth": "<32 random bytes, base64url — the secret that authorises delete>",
  "current_version": 1,
  "expiry": { "expires_at_ms": null, "max_access_count": null, "auto_delete": false },
  "published_at_ms": 1748822400000,
  "api_base": "https://send.sgraph.ai"
}
```

- Written via the vault client's file-write into the owner's tree (`SGVault` write path; the same mechanism the vault UI uses for any file). It is just a conventional path — no vault schema change.
- The **`delete_auth` never appears in any public artefact, URL, or log** — only inside the owner's encrypted vault. This is what makes delete-then-recreate possible across devices while keeping the public layer truly public-and-read-only.
- Composes cleanly with the sub-vaults `.vault/owner/` convention (doc 02 §4.4): `.sgraph/public-previews/` is a sibling conventional subtree.

---

## 5. Wire format (verified — no SGMETA in the vault UI)

**Correction from the readiness check:** SGMETA is **not used anywhere in the vault UI** (only in the share UI). Vault-UI transfers store **raw `IV(12) ‖ AES-256-GCM ciphertext`**. So the preview is stored as plain `encrypt(utf8(JSON.stringify(preview)))` — no envelope:

- **Encryption:** `SGSendCrypto.encrypt(bytes, key)` (`VAULT/_common/js/lib/sg-send/sg-send-crypto.js`) → `IV(12) ‖ ciphertext`.
- **Upload:** `SGSend.upload(cipher, { transferId, deleteAuthHash, expiresAt, maxDownloads, autoDelete, contentType:'application/json' })` (after the small `upload()` extension — doc 06 §0).
- **Read path:** `SGSend.download(transferId)` → `ArrayBuffer` → `SGSendCrypto.decrypt(buf, readKeyRO)` → `JSON.parse(utf8)` → `validatePreview`. **No vault dependency, no envelope unwrap.**

(If we later want the transparency "open on the send.sgraph.ai open UI" link to render the blob as a named JSON file, a tiny optional SGMETA wrap can be added — doc 08 Q-transparency. Not needed for the card's own read path.)

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
