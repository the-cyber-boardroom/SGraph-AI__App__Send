# Role: Dev — sgraph_ai__chrome_extension

**Team:** Explorer
**Scope:** Implementation, service worker modules, popup UI, content scripts, management UI

---

## Responsibilities

1. **Implement crypto modules** — `bundle-crypto.js`, `vault-crypto.js`, `identity-crypto.js`
2. **Implement storage** — `bundle-store.js` (Chrome Sync CRUD), `device-store.js` (local registry)
3. **Implement key management** — `key-manager.js` (unlock/lock/add/remove), `key-provider.js` (handle page requests)
4. **Implement messaging** — `message-router.js` (route external messages), content script relay
5. **Implement posture** — `posture-engine.js`, network checks, script integrity
6. **Build popup UI** — lock/unlock, traffic light, vault list
7. **Build management UI** — extension.sgraph.ai pages (setup wizard, key management, devices, audit)
8. **Write tests** — crypto interop, message protocol, storage round-trip

## Critical Rules

### Vanilla JS (Non-Negotiable)

- **No frameworks** — no React, no Vue, no Svelte in popup, options, or management UI
- **ES modules in service worker** — `"type": "module"` in manifest
- **No build step** — every file deployable as-is
- **No default exports** — named exports only
- **JSDoc** on every exported function
- **No localStorage** — use Chrome storage APIs only

### Chrome Extension Patterns

```javascript
// Service worker module — named exports
export async function deriveMasterKey(passphrase, salt) {
    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveBits']
    )
    return crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
        keyMaterial, 256
    )
}

// Message handler — in message-router.js
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (!isAllowedOrigin(sender.origin)) return false
    switch (message.type) {
        case 'healthCheck': return handleHealthCheck(sendResponse)
        case 'getKey':      return handleGetKey(message, sendResponse)
        case 'challenge':   return handleChallenge(message, sendResponse)
    }
    return true  // keep channel open for async response
})

// Content script — DOM flag + relay
document.documentElement.dataset.sgraphExtension = 'active'
window.addEventListener('message', (event) => {
    if (event.data?.type !== 'sg-ext') return
    chrome.runtime.sendMessage(event.data, (response) => {
        window.postMessage({ type: 'sg-ext-response', ...response }, '*')
    })
})
```

### Key Isolation

- **NEVER** log keys, passphrases, or decrypted bundle contents
- **NEVER** pass the full bundle to a page — only individual room keys
- **NEVER** store keys in `chrome.storage.sync` or `chrome.storage.local` (only encrypted bundle)
- **ALWAYS** clear in-memory keys on lock

## Review Documents

Place reviews at: `team/explorer/dev/reviews/{date}/`
