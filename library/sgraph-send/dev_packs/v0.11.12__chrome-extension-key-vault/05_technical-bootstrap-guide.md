# Technical Bootstrap Guide

**Version:** v0.11.12
**Purpose:** Step-by-step instructions for setting up the sgraph_ai__chrome_extension repo from scratch.

---

## Phase 0: Prerequisites

Clone the SG/Send main repo for reference (read-only):

```bash
git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref
```

You need this to:
- Read the source brief (Parts 1-11)
- Copy crypto source code for interop reference
- Read the architecture patterns

---

## Phase 1: Repo Skeleton (DO THIS FIRST)

### 1.1 Create Repo Structure

```
sgraph_ai__chrome_extension/
├── .claude/
│   ├── CLAUDE.md                          # Main project guidance (from template)
│   └── explorer/
│       └── CLAUDE.md                      # Explorer team session instructions
├── .github/
│   └── workflows/
│       ├── ci.yml                         # Reusable base
│       ├── ci__dev.yml                    # Dev trigger (tests only)
│       └── ci__main.yml                   # Main trigger (tests → package → publish)
├── extension/
│   ├── manifest.json                      # Manifest V3
│   ├── version                            # Contains: v0.1.0
│   ├── background/
│   │   ├── service-worker.js              # Main entry point
│   │   ├── crypto/
│   │   │   ├── bundle-crypto.js           # Bundle encrypt/decrypt
│   │   │   ├── vault-crypto.js            # Vault key derivation (interop)
│   │   │   └── identity-crypto.js         # Ed25519 generation/signing
│   │   ├── storage/
│   │   │   ├── bundle-store.js            # Chrome Sync CRUD
│   │   │   └── device-store.js            # Device registry
│   │   ├── keys/
│   │   │   ├── key-manager.js             # Unlock/lock/add/remove
│   │   │   └── key-provider.js            # Handle page key requests
│   │   ├── posture/
│   │   │   ├── posture-engine.js          # Traffic light aggregation
│   │   │   ├── network-check.js           # HTTPS, cert checks
│   │   │   └── script-check.js            # Script integrity
│   │   └── messaging/
│   │       └── message-router.js          # Route external messages
│   ├── content/
│   │   ├── content-script.js              # DOM flag + postMessage relay
│   │   └── dom-monitor.js                 # MutationObserver tamper detection
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── options/
│   │   ├── options.html
│   │   ├── options.js
│   │   └── options.css
│   └── icons/
│       ├── icon-16.png
│       ├── icon-32.png
│       ├── icon-48.png
│       └── icon-128.png
├── extension-ui/                          # Management UI (extension.sgraph.ai)
│   ├── index.html
│   ├── setup/
│   │   └── index.html
│   ├── keys/
│   │   └── index.html
│   ├── devices/
│   │   └── index.html
│   └── _common/
│       ├── css/
│       │   └── extension-ui.css
│       └── js/
│           └── extension-bridge.js
├── tests/
│   ├── unit/
│   │   ├── crypto/
│   │   │   ├── test-bundle-crypto.js
│   │   │   ├── test-vault-crypto.js
│   │   │   └── test-identity-crypto.js
│   │   ├── storage/
│   │   │   └── test-bundle-store.js
│   │   └── keys/
│   │       └── test-key-manager.js
│   ├── integration/
│   │   └── test-page-extension.js
│   └── browser/
│       └── test-extension-loaded.js
├── briefs/
│   └── BRIEF_PACK.md                     # Session bootstrap (10 sections)
├── team/
│   ├── explorer/
│   │   ├── architect/
│   │   │   ├── README.md
│   │   │   ├── ROLE__architect.md
│   │   │   └── reviews/
│   │   ├── dev/
│   │   │   ├── README.md
│   │   │   ├── ROLE__dev.md
│   │   │   └── reviews/
│   │   ├── qa/
│   │   │   ├── README.md
│   │   │   ├── ROLE__qa.md
│   │   │   └── reviews/
│   │   ├── appsec/
│   │   │   ├── README.md
│   │   │   ├── ROLE__appsec.md
│   │   │   └── reviews/
│   │   ├── devops/
│   │   │   ├── README.md
│   │   │   ├── ROLE__devops.md
│   │   │   └── reviews/
│   │   ├── librarian/
│   │   │   ├── README.md
│   │   │   ├── ROLE__librarian.md
│   │   │   ├── reviews/
│   │   │   └── reality/
│   │   │       └── v0.1.0__what-exists-today.md
│   │   └── historian/
│   │       ├── README.md
│   │       ├── ROLE__historian.md
│   │       └── reviews/
│   └── humans/dinis_cruz/
│       ├── briefs/                        # READ-ONLY for agents
│       ├── debriefs/
│       └── claude-code-web/
└── README.md
```

### 1.2 Create Version File

```bash
echo "v0.1.0" > extension/version
```

### 1.3 Create manifest.json

See `architecture.md` for the complete manifest. Key points:
- `"manifest_version": 3`
- `"type": "module"` for service worker
- `"permissions": ["storage"]`
- `"host_permissions": ["https://*.sgraph.ai/*"]`
- `"externally_connectable": { "matches": ["https://*.sgraph.ai/*"] }`

### 1.4 Create CLAUDE.md Files

Copy from `claude-md-templates/` in this dev pack:
- `CLAUDE.md` → `.claude/CLAUDE.md`
- `explorer__CLAUDE.md` → `.claude/explorer/CLAUDE.md`

### 1.5 Create Team Structure

For each of the 7 roles (architect, dev, qa, appsec, devops, librarian, historian):
1. Create directory: `team/explorer/{role}/`
2. Create `README.md` with role name + one-line description
3. Copy `ROLE__{name}.md` from `03_role-definitions/` in this dev pack
4. Create `reviews/` directory

### 1.6 Create Initial Reality Document

```markdown
# SGraph Key Vault Extension — What Exists Today (v0.1.0)

**Last verified:** {date}

## Service Worker Modules
None yet.

## Content Scripts
None yet.

## Popup UI
None yet.

## Management UI (extension.sgraph.ai)
None yet.

## Message Types
None yet.

## Chrome Web Store
- Extension ID: NOT YET LOCKED
- Status: Not published

## Tests
None yet.

## PROPOSED — Does Not Exist Yet
- Bundle crypto (planned Phase 1)
- Vault crypto interop (planned Phase 1)
- Ed25519 identity (planned Phase 1)
- Chrome Sync storage (planned Phase 1)
- Page detection (planned Phase 1)
- Key provision (planned Phase 1)
- Popup UI (planned Phase 1)
- Security posture (planned Phase 2)
- Independent API channel (planned Phase 3)
- Cross-device 2FA (planned Phase 4)
- Corporate branded extensions (planned Phase 5)
```

---

## Phase 2: Crypto Modules (GATE — Must Pass Before Anything Else)

### 2.1 Implement vault-crypto.js

Port `SGVaultCrypto` to ES module format:

```javascript
// extension/background/crypto/vault-crypto.js

const KDF_ITERATIONS = 600000
const KEY_LENGTH = 256
const FILE_ID_LENGTH = 12

/** Parse a vault key string into passphrase and vault ID */
export function parseVaultKey(fullVaultKey) { ... }

/** Derive read key, write key, tree file ID, settings file ID */
export async function deriveVaultKeys(passphrase, vaultId) { ... }
```

### 2.2 Implement bundle-crypto.js

```javascript
// extension/background/crypto/bundle-crypto.js

/** Derive master key from passphrase + random salt */
export async function deriveMasterKey(passphrase, salt) { ... }

/** Encrypt a plaintext bundle JSON string */
export async function encryptBundle(masterKey, plaintextJson) { ... }

/** Decrypt a ciphertext object back to plaintext JSON */
export async function decryptBundle(masterKey, ciphertextObj) { ... }

/** Generate a random salt for a new bundle */
export function generateSalt() { ... }
```

### 2.3 Write Interop Tests

**This is the gate.** The extension's `deriveVaultKeys()` must produce identical output to the browser's `SGVaultCrypto.deriveKeys()`.

Generate test vectors by running in a browser console on send.sgraph.ai:
```javascript
const { readKey, writeKey, treeFileId, settingsFileId } =
    await SGVaultCrypto.deriveKeys('test-passphrase', 'a1b2c3d4')
const exported = await crypto.subtle.exportKey('raw', readKey)
console.log('readKey:', Array.from(new Uint8Array(exported)).map(b => b.toString(16).padStart(2, '0')).join(''))
console.log('writeKey:', writeKey)
console.log('treeFileId:', treeFileId)
console.log('settingsFileId:', settingsFileId)
```

---

## Phase 3: Service Worker + Messaging

### 3.1 Implement key-manager.js and key-provider.js
### 3.2 Implement bundle-store.js (Chrome Sync CRUD)
### 3.3 Implement message-router.js (handle external messages)
### 3.4 Implement content-script.js (DOM flag + relay)

---

## Phase 4: Popup + Management UI

### 4.1 Popup: lock/unlock button, traffic light, vault list
### 4.2 Management UI: setup wizard at extension.sgraph.ai

---

## Phase 5: Publish Unlisted

### 5.1 Package as .zip
### 5.2 Upload to Chrome Web Store (unlisted)
### 5.3 Record the permanent extension ID

---

## Verification Checklist

Before declaring Phase 1 complete:

- [ ] `.claude/CLAUDE.md` exists and is comprehensive
- [ ] `.claude/explorer/CLAUDE.md` exists
- [ ] `team/explorer/` has all 7 role directories with README + ROLE files
- [ ] `briefs/BRIEF_PACK.md` exists with all 10 sections
- [ ] Reality document exists and is current
- [ ] `extension/version` contains `v0.1.0`
- [ ] `extension/manifest.json` is valid Manifest V3
- [ ] `vault-crypto.js` passes interop tests against browser vectors
- [ ] `bundle-crypto.js` passes encrypt/decrypt round-trip
- [ ] `identity-crypto.js` generates Ed25519 keys and signs/verifies
- [ ] Extension loads as unpacked in Chrome without errors
- [ ] `externally_connectable` healthCheck responds from sgraph.ai page
- [ ] Key provision works: page requests key → gets correct room key
- [ ] Popup shows lock/unlock state
- [ ] Published to Chrome Web Store (unlisted), extension ID recorded
