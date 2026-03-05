# AppSec Addendum: Chrome Extension Security Model

**Version:** v0.11.12

---

## Key Isolation Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Service Worker (TRUSTED — highest isolation)             │
│                                                         │
│  ┌───────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │ Master Key     │  │ Decrypted   │  │ Identity     │ │
│  │ (in memory)    │  │ Bundle      │  │ Private Key  │ │
│  │                │  │ (in memory) │  │ (in memory)  │ │
│  └───────────────┘  └─────────────┘  └──────────────┘ │
│                                                         │
│  NEVER exits this context. NEVER stored. NEVER logged.  │
└─────────────────────────┬───────────────────────────────┘
                          │
              Only individual room keys
              flow down (one per request)
                          │
┌─────────────────────────┴───────────────────────────────┐
│ Content Script (SEMI-TRUSTED — shared DOM)               │
│                                                         │
│  • Relays messages only                                 │
│  • Never handles keys directly                          │
│  • Sets DOM flag (spoofable — treat as convenience)     │
│  • Runs MutationObserver for tamper detection            │
└─────────────────────────┬───────────────────────────────┘
                          │
              postMessage (observable by page)
                          │
┌─────────────────────────┴───────────────────────────────┐
│ Page Context (UNTRUSTED)                                 │
│                                                         │
│  • Receives individual room keys on request             │
│  • Never sees passphrase, master key, or full bundle    │
│  • Uses externally_connectable (preferred, private)     │
│  • Fallback: postMessage via content script              │
└─────────────────────────────────────────────────────────┘
```

---

## Content Security Policy

In `manifest.json`:

```json
{
    "content_security_policy": {
        "extension_pages": "script-src 'self'; object-src 'none'"
    }
}
```

This prevents:
- Inline script execution in popup and options pages
- Remote code loading
- `eval()` and `new Function()`
- Object/embed/applet elements

---

## Origin Validation

`externally_connectable` restricts which origins can send messages:

```json
{
    "externally_connectable": {
        "matches": ["https://send.sgraph.ai/*", "https://*.sgraph.ai/*"]
    }
}
```

The service worker MUST additionally verify `sender.origin` on every message:

```javascript
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    const origin = new URL(sender.origin || sender.url)
    if (!origin.hostname.endsWith('.sgraph.ai')) {
        sendResponse({ error: 'unauthorized_origin' })
        return
    }
    // ... handle message
})
```

---

## Chrome Sync Security

What's stored: only the `KeyBundleCiphertext` — encrypted with AES-256-GCM, useless without the user's passphrase.

| Stored | Not Stored |
|--------|-----------|
| Encrypted bundle (ciphertext + nonce + salt) | Passphrase |
| KDF parameters (iterations, hash algo) | Master key |
| Bundle format version | Decrypted bundle |
| | Identity private key (only in encrypted bundle) |
| | Room keys (only in encrypted bundle) |

**Attack scenario:** If Chrome Sync is compromised, the attacker gets the encrypted bundle. They must still brute-force the passphrase through 600,000 PBKDF2 iterations.

---

## Monkey-Patch Detection

Other extensions' content scripts share the page DOM and can override globals. The extension's content script should verify:

```javascript
// In content-script.js (runs in isolated world — has clean references)
const cleanFetch = fetch
const cleanCrypto = crypto.subtle
const cleanPostMessage = window.postMessage

// In page context, check for tampering:
if (window.fetch !== cleanFetch) { /* TAMPERED */ }
if (window.crypto.subtle !== cleanCrypto) { /* TAMPERED */ }
```

Note: Content scripts run in an "isolated world" with clean JS globals. The page's JS globals may be monkey-patched by other extensions' content scripts running in the "main world."

---

## Supply Chain

The extension has **zero third-party dependencies**:
- Crypto: Web Crypto API (browser built-in)
- Storage: Chrome Storage API (browser built-in)
- Messaging: Chrome Runtime API (browser built-in)
- UI: Vanilla HTML/CSS/JS

No npm, no CDN imports, no external scripts. This eliminates the entire supply chain attack surface.

---

## Session Token Security

`chrome.storage.session` stores an unlock token to avoid re-prompting within a browser session:

- **Scope:** Current browser session only (cleared on browser close)
- **Not synced:** `chrome.storage.session` is local-only
- **Not persisted to disk:** Lives in memory
- **Encrypted:** The token itself is encrypted (defense in depth)
- **Expiry:** Auto-expires after configurable timeout (default: 30 minutes)

---

## Security Testing Checklist

| # | Test | Method |
|---|------|--------|
| 1 | No plaintext keys in storage | Inspect all `chrome.storage` entries |
| 2 | No keys in console | Search all `console.log` calls |
| 3 | No keys in network requests | Monitor network tab during key operations |
| 4 | Origin rejection | Send message from non-sgraph.ai page |
| 5 | Full bundle never returned | Inspect all message responses |
| 6 | Keys cleared on lock | Inspect service worker memory after lock |
| 7 | Red posture locks keys | Trigger red condition, verify key requests fail |
| 8 | No inline scripts | Validate CSP, grep for `onclick` etc. |
| 9 | No eval() | Grep entire codebase |
| 10 | Ed25519 private key stays in worker | Inspect all message responses |
