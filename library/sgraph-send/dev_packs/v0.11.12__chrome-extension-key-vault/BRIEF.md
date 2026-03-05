# BRIEF: SGraph Key Vault Chrome Extension

**Version:** v0.11.12
**Date:** 5 March 2026
**Source brief:** `team/humans/dinis_cruz/briefs/03/04/v0.11.1__dev-brief__chrome-extension-key-vault.md`

---

## What This Is

A Chrome extension that turns key management into a background service. Keys are encrypted with a user-chosen passphrase, stored in Chrome Sync (encrypted — useless without the passphrase), and automatically provided to sgraph.ai pages when needed. The SG/Send server never sees the keys.

This is the missing piece that makes vaults, workspaces, data rooms, and the full PKI story usable for real daily work.

---

## The Problem

Every friction point in SG/Send traces back to key management:
- Users lose passphrases
- Keys don't follow users across devices
- Vaults need manual key entry every session
- Workspace forgets state when browser closes
- Data room recipients must manually enter decryption keys

---

## Constraints (Non-Negotiable)

1. **Manifest V3** — Chrome's current extension platform (no Manifest V2)
2. **Vanilla JS** — no frameworks, no build step, every file deployable as-is
3. **Web Crypto API** — all crypto in the service worker (AES-256-GCM, PBKDF2, Ed25519)
4. **Zero-knowledge preserved** — extension never sends keys or passphrase to any server
5. **Minimum permissions** — `storage` + host permissions for `*.sgraph.ai` only
6. **No localStorage** — Chrome Sync for cross-device, `chrome.storage.session` for unlock state
7. **Interop with existing crypto** — must use same KDF parameters as vault crypto (PBKDF2, 600k iterations, same salt format)
8. **Service worker architecture** — all sensitive operations in the service worker, never in content scripts or page context

---

## Phases

### Phase 1: Key Vault MVP (Session 1-2)

| # | Deliverable | Success Criteria |
|---|------------|-----------------|
| 1.1 | Repo structure with team setup | CLAUDE.md, roles, BRIEF_PACK.md, reality document |
| 1.2 | Manifest V3 skeleton | manifest.json, service worker, content script, popup |
| 1.3 | Crypto module | Key derivation (PBKDF2), bundle encrypt/decrypt (AES-256-GCM), Ed25519 identity keys |
| 1.4 | Key bundle CRUD | Create, unlock, lock, change passphrase, add/remove room keys |
| 1.5 | Chrome Sync storage | Save/load encrypted bundle, handle quota |
| 1.6 | Page detection | `externally_connectable` handshake, challenge-response, DOM flag |
| 1.7 | Key provision | Page requests key → service worker returns only requested key |
| 1.8 | Popup UI | Lock/unlock, traffic light status, vault list |
| 1.9 | Publish unlisted | Chrome Web Store upload, lock extension ID |

### Phase 2: Security Posture (Session 3)

| # | Deliverable | Success Criteria |
|---|------------|-----------------|
| 2.1 | HTTPS/cert checks | Refuse keys over HTTP, detect unexpected CA |
| 2.2 | Script integrity | Hash loaded scripts, compare to known-good |
| 2.3 | DOM tamper detection | MutationObserver for injected scripts/iframes |
| 2.4 | Device registry | Fingerprint + known device tracking |
| 2.5 | Traffic light badge | Green/amber/red icon badge with auto-lock on red |

### Phase 3: Independent API Channel (Session 4)

| # | Deliverable | Success Criteria |
|---|------------|-----------------|
| 3.1 | Service worker fetch | Direct API calls from extension context |
| 3.2 | Signed requests | Extension authentication header |
| 3.3 | Device attestation | Signed posture report on vault access |
| 3.4 | Health check | Server genuineness verification |

### Phase 4: Cross-Device Communication (Session 5)

| # | Deliverable | Success Criteria |
|---|------------|-----------------|
| 4.1 | Encrypted blob relay | Deposit/retrieve via SG/Send API |
| 4.2 | 2FA flow | Challenge on Device A, approve on Device B |
| 4.3 | Key sharing | Send vault key between devices E2E encrypted |
| 4.4 | Polling notifications | <10 second latency for pending approvals |

### Phase 5: Distribution + Corporate Extensions (Session 6+)

| # | Deliverable | Success Criteria |
|---|------------|-----------------|
| 5.1 | Public Chrome Web Store listing | Auto-update working |
| 5.2 | Edge Add-ons store | Same package, separate listing |
| 5.3 | Extension install prompts | sgraph.ai pages detect and prompt |
| 5.4 | Corporate branded pipeline | `sg-extension create` single command |
| 5.5 | First corporate extension | Published, auto-updating |

---

## Data Model

### KeyBundlePlaintext

```
version         : uint           # Bundle format version
createdAt       : ISO 8601       # Bundle creation timestamp
updatedAt       : ISO 8601       # Last modification
identityKeys:
  publicKey     : base64url      # Ed25519 public key
  privateKey    : base64url      # Ed25519 private key (SENSITIVE)
rooms:
  [roomId]:
    roomKey     : string         # Vault key (passphrase:vault_id format)
    name        : string         # Human-readable vault/room name
    lastUsedAt  : ISO 8601       # Last access timestamp
```

### KeyBundleCiphertext (stored in Chrome Sync)

```
version         : uint           # Ciphertext format version
salt            : base64url      # Random per-bundle, used for PBKDF2
kdfParams:
  algo          : "PBKDF2"       # Or "argon2id" in future
  iterations    : 600000
  hash          : "SHA-256"
nonce           : base64url      # 12 bytes, random per encryption
ciphertext      : base64url      # AEAD ciphertext + auth tag
```

Storage key: `sgraph_key_bundle_v1` in `chrome.storage.sync`.

---

## Message Protocol (Page ↔ Extension)

### Via `externally_connectable`

Page → Extension:
```javascript
chrome.runtime.sendMessage(EXTENSION_ID, {
    type: 'healthCheck'
})
// Response: { version, posture, deviceFingerprint }

chrome.runtime.sendMessage(EXTENSION_ID, {
    type: 'getKey',
    roomId: 'abc12345'
})
// Response: { roomKey: '...' } or { error: 'locked' }

chrome.runtime.sendMessage(EXTENSION_ID, {
    type: 'challenge',
    nonce: '...'
})
// Response: { signature: '...', publicKey: '...' }
```

### Via Content Script (fallback)

Content script injects a DOM flag: `document.documentElement.dataset.sgraphExtension = 'active'`

Page communicates via `window.postMessage` → content script relays to service worker via `chrome.runtime.sendMessage`.

---

## Crypto Parameters (Must Match Existing Vault Crypto)

| Parameter | Value | Source |
|-----------|-------|--------|
| KDF | PBKDF2-HMAC-SHA256 | `sg-vault-crypto.js` |
| KDF iterations | 600,000 | `SGVaultCrypto.KDF_ITERATIONS` |
| KDF salt (read key) | `sg-vault-v1:{vault_id}` | `SGVaultCrypto.deriveKeys()` |
| KDF salt (write key) | `sg-vault-v1:write:{vault_id}` | `SGVaultCrypto.deriveKeys()` |
| Encryption | AES-256-GCM | `SendCrypto.ALGORITHM` |
| Key size | 256 bits | `SendCrypto.KEY_LENGTH` |
| Nonce (IV) | 12 bytes random | `SendCrypto.IV_LENGTH` |
| Wire format | `[12 bytes nonce][ciphertext + tag]` | `SendCrypto.encryptFile()` |
| Identity keys | Ed25519 | New for extension |
| Bundle encryption salt | Random per-bundle | New for extension |

**The extension's bundle encryption** uses the same PBKDF2 + AES-256-GCM as vaults, but with a per-bundle random salt (not `sg-vault-v1:{id}`). This keeps the user's master passphrase independent of any vault passphrase.

**The extension's vault key storage** stores the vault key string (`passphrase:vault_id`) which is then used with `SGVaultCrypto.deriveKeys()` to derive the actual AES key when needed.

---

## Files to Read in SG/Send Main Repo

| What | Path | Why |
|------|------|-----|
| **Source brief** | `team/humans/dinis_cruz/briefs/03/04/v0.11.1__dev-brief__chrome-extension-key-vault.md` | Full 11-part brief |
| **Vault crypto** | `sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-vault/sg-vault-crypto.js` | PBKDF2 KDF params to match |
| **Send crypto** | `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/crypto.js` | AES-256-GCM encrypt/decrypt |
| **Vault logic** | `sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-vault/sg-vault.js` | Vault key format, tree structure |
| **Send crypto (vault ver)** | `sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-send/sg-send-crypto.js` | Vault-specific send crypto |

---

## Human Decisions Already Made

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Separate repo for the extension | Different deployment model (Chrome Web Store, not Lambda/S3) |
| D2 | Manifest V3 | Chrome's current platform, required for new submissions |
| D3 | PBKDF2 for MVP, Argon2id later | PBKDF2 via Web Crypto API (no WASM needed for MVP) |
| D4 | Chrome Sync for storage | Cross-device without our own sync server |
| D5 | `externally_connectable` as primary page API | Private channel, no DOM pollution |
| D6 | Publish unlisted early | Lock the extension ID for page integration |
| D7 | extension.sgraph.ai for management UI | Full key management page, separate from popup |
| D8 | Traffic light model | Green/amber/red security posture, auto-lock on red |
| D9 | Corporate branded extensions | Business model: config variants, not forks |
| D10 | Ed25519 for identity | Signing, PKI, device attestation |

---

## Package Details

| Field | Value |
|-------|-------|
| Repository | `https://github.com/the-cyber-boardroom/sgraph_ai__chrome_extension` |
| Extension name | SGraph Key Vault |
| Chrome Web Store listing | To be created (unlisted initially) |
| Code folder | `extension/` |
| Management UI | `extension-ui/` (deployed to extension.sgraph.ai) |
| Default branch | `dev` |
| Version file | `extension/version` |
