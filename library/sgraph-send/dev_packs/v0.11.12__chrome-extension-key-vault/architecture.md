# Architecture: SGraph Key Vault Chrome Extension

**Version:** v0.11.12

---

## Extension Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Chrome Extension (SGraph Key Vault)                         │
│                                                             │
│  ┌─────────────────────┐  ┌──────────────────────────────┐ │
│  │ Service Worker       │  │ Popup UI                     │ │
│  │ (background.js)      │  │ (popup.html + popup.js)      │ │
│  │                      │  │                              │ │
│  │ • Crypto operations  │  │ • Lock/unlock button         │ │
│  │ • Bundle management  │  │ • Traffic light status       │ │
│  │ • Key provision      │  │ • Vault/room list            │ │
│  │ • Posture assessment │  │ • Quick actions              │ │
│  │ • API channel        │  │                              │ │
│  └──────────┬───────────┘  └──────────────────────────────┘ │
│             │                                               │
│  ┌──────────┴───────────┐  ┌──────────────────────────────┐ │
│  │ Content Script        │  │ Chrome Storage               │ │
│  │ (content.js)          │  │                              │ │
│  │                       │  │ • chrome.storage.sync        │ │
│  │ • DOM flag injection  │  │   (encrypted bundle)         │ │
│  │ • postMessage relay   │  │ • chrome.storage.session     │ │
│  │ • DOM tamper detect   │  │   (unlock token)             │ │
│  │ • Script integrity    │  │ • chrome.storage.local       │ │
│  └───────────────────────┘  │   (device registry)          │ │
│                              └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
         │                              │
         │ externally_connectable       │ Chrome Sync
         │ (private channel)            │ (cross-device)
         ▼                              ▼
┌─────────────────────┐      ┌──────────────────┐
│ sgraph.ai pages      │      │ Other devices     │
│ (send, vault,        │      │ (same Chrome      │
│  workspace,          │      │  account)          │
│  extension.sgraph.ai)│      │                   │
└─────────────────────┘      └──────────────────┘
```

---

## File Structure

### Extension Package

```
extension/
├── manifest.json               # Manifest V3
├── version                     # Extension version (v0.1.0)
├── background/
│   ├── service-worker.js       # Main service worker (registers modules)
│   ├── crypto/
│   │   ├── bundle-crypto.js    # Bundle encrypt/decrypt (masterKey → bundle)
│   │   ├── vault-crypto.js     # Vault key derivation (interop with SGVaultCrypto)
│   │   └── identity-crypto.js  # Ed25519 key generation/signing
│   ├── storage/
│   │   ├── bundle-store.js     # CRUD for encrypted bundle in Chrome Sync
│   │   └── device-store.js     # Device registry in chrome.storage.local
│   ├── keys/
│   │   ├── key-manager.js      # Unlock/lock/add room/remove room
│   │   └── key-provider.js     # Handle key requests from pages
│   ├── posture/
│   │   ├── posture-engine.js   # Aggregate posture signals → traffic light
│   │   ├── network-check.js    # HTTPS, cert, latency
│   │   └── script-check.js     # Script hash verification
│   └── messaging/
│       └── message-router.js   # Route messages from page/content script
├── content/
│   ├── content-script.js       # DOM flag + postMessage relay
│   └── dom-monitor.js          # MutationObserver for tamper detection
├── popup/
│   ├── popup.html              # Popup shell
│   ├── popup.js                # Popup logic
│   └── popup.css               # Popup styling
├── options/
│   ├── options.html            # Options/settings page (basic)
│   ├── options.js
│   └── options.css
├── icons/
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
└── _locales/
    └── en/
        └── messages.json       # i18n strings
```

### Management UI (extension.sgraph.ai)

```
extension-ui/
├── index.html                  # Main management page
├── setup/
│   └── index.html              # First-time setup wizard
├── keys/
│   └── index.html              # Key/room management
├── devices/
│   └── index.html              # Device registry
├── audit/
│   └── index.html              # Access audit log
├── _common/
│   ├── css/
│   │   └── extension-ui.css    # Shared styles
│   └── js/
│       ├── extension-bridge.js # Communication with extension
│       └── ui-components.js    # Shared UI components
└── privacy/
    └── index.html              # Privacy policy page
```

---

## manifest.json

```json
{
    "manifest_version": 3,
    "name": "SGraph Key Vault",
    "version": "0.1.0",
    "description": "Encrypted key management for SGraph vaults. Zero-knowledge — keys never leave your device.",
    "permissions": [
        "storage"
    ],
    "host_permissions": [
        "https://send.sgraph.ai/*",
        "https://*.sgraph.ai/*"
    ],
    "externally_connectable": {
        "matches": [
            "https://send.sgraph.ai/*",
            "https://*.sgraph.ai/*"
        ]
    },
    "background": {
        "service_worker": "background/service-worker.js",
        "type": "module"
    },
    "content_scripts": [
        {
            "matches": ["https://send.sgraph.ai/*", "https://*.sgraph.ai/*"],
            "js": ["content/content-script.js"],
            "run_at": "document_start"
        }
    ],
    "action": {
        "default_popup": "popup/popup.html",
        "default_icon": {
            "16": "icons/icon-16.png",
            "32": "icons/icon-32.png",
            "48": "icons/icon-48.png",
            "128": "icons/icon-128.png"
        }
    },
    "options_ui": {
        "page": "options/options.html",
        "open_in_tab": true
    },
    "icons": {
        "16": "icons/icon-16.png",
        "48": "icons/icon-48.png",
        "128": "icons/icon-128.png"
    }
}
```

---

## Service Worker Module Architecture

The service worker uses ES modules (`"type": "module"` in manifest). All sensitive operations are in the service worker — never in content scripts or page context.

### Module Dependency Graph

```
service-worker.js
├── crypto/bundle-crypto.js       (imports: Web Crypto API)
├── crypto/vault-crypto.js        (imports: Web Crypto API)
├── crypto/identity-crypto.js     (imports: Web Crypto API)
├── storage/bundle-store.js       (imports: chrome.storage.sync)
├── storage/device-store.js       (imports: chrome.storage.local)
├── keys/key-manager.js           (imports: bundle-crypto, bundle-store)
├── keys/key-provider.js          (imports: key-manager)
├── posture/posture-engine.js     (imports: network-check, script-check)
├── posture/network-check.js      (no internal deps)
├── posture/script-check.js       (no internal deps)
└── messaging/message-router.js   (imports: key-provider, posture-engine)
```

### Key Isolation Rules

1. **Passphrase** — only in memory during derivation, then discarded
2. **Master key** — in service worker memory only, never stored
3. **Decrypted bundle** — in service worker memory only, cleared on lock
4. **Individual room keys** — returned one-at-a-time to requesting page, never the full bundle
5. **Identity private key** — in decrypted bundle only, used for signing in service worker
6. **Encrypted bundle** — the only thing that touches storage (Chrome Sync)

---

## Service Worker Lifecycle

Chrome can terminate and restart the service worker at any time. This affects in-memory state:

**On termination:**
- Master key lost (user must re-enter passphrase on next interaction)
- Mitigation: use `chrome.storage.session` to store a short-lived unlock token (encrypted)
- `chrome.storage.session` is cleared when browser closes (not persisted to disk)

**On wake-up:**
1. Check `chrome.storage.session` for unlock token
2. If valid: derive master key from token, decrypt bundle → unlocked state
3. If expired/missing: prompt for passphrase → locked state

**Auto-lock:**
- After configurable idle timeout (default: 30 minutes)
- On red security posture
- Clear all in-memory keys + invalidate session token

---

## Communication Flows

### Page → Extension (externally_connectable)

```
sgraph.ai page                        Service Worker
     │                                      │
     │─── sendMessage(EXT_ID, {           │
     │      type: 'healthCheck'            │
     │    })                               │
     │                                      │
     │<── { version: '0.1.0',              │
     │      posture: 'green',              │
     │      unlocked: true }               │
     │                                      │
     │─── sendMessage(EXT_ID, {           │
     │      type: 'getKey',                │
     │      roomId: 'abc12345'             │
     │    })                               │
     │                                      │
     │<── { roomKey: 'pass:abc12345' }     │
     │    OR { error: 'locked' }           │
     │    OR { error: 'not_found' }        │
```

### Content Script → Service Worker

```
sgraph.ai page        Content Script        Service Worker
     │                      │                      │
     │ postMessage({        │                      │
     │   type: 'sg-ext',   │                      │
     │   action: 'getKey', │                      │
     │   roomId: '...'     │                      │
     │ })                  │                      │
     │                      │ chrome.runtime       │
     │                      │ .sendMessage({       │
     │                      │   type: 'getKey',    │
     │                      │   roomId: '...',     │
     │                      │   origin: tab.url    │
     │                      │ })                   │
     │                      │                      │
     │                      │<── { roomKey: '...'} │
     │ postMessage({        │                      │
     │   type: 'sg-ext-r', │                      │
     │   roomKey: '...'    │                      │
     │ })                  │                      │
```

---

## Traffic Light Posture Model

| Level | Criteria | Action |
|-------|----------|--------|
| **Green** | HTTPS + valid cert, no suspicious extensions, known device, scripts verified, no DOM tampering | Normal operation — keys provided on request |
| **Amber** | Unknown device, DevTools open, broad-permission extensions detected, incognito | Warn user, keys still available on explicit request |
| **Red** | HTTP, script integrity fail, DOM injection, cert mismatch, monkey-patched APIs | **Lock keys immediately**, user must acknowledge risk to override |

Icon badge colour updates in real-time. The posture engine runs checks on:
- Every page load (content script reports)
- Every key request (before responding)
- Periodic background checks (every 60 seconds)

---

## Corporate Branded Extension Architecture

All corporate extensions share the same codebase. Differences are configuration only:

```
Official:                           Corporate (Acme):
manifest.json (sgraph branding)     manifest.json (acme branding)
config.json (default policies)      config.json (acme policies)
icons/ (sgraph icons)               icons/ (acme icons)
branding/ (sgraph theme)            branding/ (acme theme)

← Same service worker, content script, popup, options →
```

Build pipeline: `sg-extension create --customer "Acme" --config acme.json --icons ./acme-icons/ --output ./build/acme/`

---

## Chrome Sync Storage Schema

```javascript
// Key: "sgraph_key_bundle_v1"
{
    version: 1,
    salt: "base64url_encoded_salt",         // 32 bytes
    kdfParams: {
        algo: "PBKDF2",
        iterations: 600000,
        hash: "SHA-256"
    },
    nonce: "base64url_encoded_nonce",        // 12 bytes
    ciphertext: "base64url_encoded_blob"     // AEAD ciphertext + tag
}
```

**Quota:** Chrome Sync allows ~100KB total. One bundle with identity keys + hundreds of room keys fits easily. If exceeded: split into indexed chunks or fall back to `chrome.storage.local` with manual export.

---

## Version Strategy

- **Extension version:** semver in `manifest.json` (Chrome requires `x.y.z` format)
- **Version file:** `extension/version` for agent tracking
- **Management UI version:** independent, folder-based versioning on extension.sgraph.ai
- **Bundle format version:** in the ciphertext wrapper (allows migration of old bundles)
