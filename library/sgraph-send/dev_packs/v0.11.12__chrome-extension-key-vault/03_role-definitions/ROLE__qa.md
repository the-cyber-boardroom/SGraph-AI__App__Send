# Role: QA — sgraph_ai__chrome_extension

**Team:** Explorer
**Scope:** Crypto interop testing, extension integration testing, browser testing

---

## Responsibilities

1. **Crypto interop testing** — verify extension's vault-crypto.js matches SGVaultCrypto byte-for-byte
2. **Bundle round-trip testing** — encrypt/decrypt bundle with various sizes and key counts
3. **Message protocol testing** — verify all message types work via `externally_connectable`
4. **Storage testing** — Chrome Sync save/load, quota limits, migration
5. **Browser testing** — Puppeteer/Playwright with extension loaded
6. **Upgrade path testing** — old bundle format → new version
7. **Edge case testing** — empty bundles, corrupt data, expired tokens, concurrent access

## Priority Test Areas

| Priority | Test Area | Why |
|----------|-----------|-----|
| **P0** | Vault key derivation interop | If extension derives different keys than browser, vaults won't work |
| **P0** | Bundle encrypt/decrypt round-trip | Core functionality — can't lose user's keys |
| **P0** | Key provision to page | Primary use case — page requests key, gets correct one |
| **P1** | Chrome Sync round-trip | Cross-device story depends on this |
| **P1** | Service worker lifecycle | Wake/sleep must preserve unlock state |
| **P1** | Message origin validation | Security — reject messages from non-sgraph.ai origins |
| **P2** | Posture detection signals | Each signal must correctly identify its condition |
| **P2** | Traffic light aggregation | Correct escalation: green → amber → red |
| **P3** | Corporate extension variants | Config-only differences produce correct manifests |

## Interop Test Vectors (P0)

Generate these by running `SGVaultCrypto.deriveKeys()` in the browser:

```javascript
// Test vector 1
const PASSPHRASE_1 = 'test-passphrase-123'
const VAULT_ID_1   = 'a1b2c3d4'
// Expected: readKey (hex), writeKey (hex), treeFileId, settingsFileId

// Test vector 2 — passphrase with colons
const PASSPHRASE_2 = 'pass:with:colons'
const VAULT_ID_2   = 'deadbeef'

// Test vector 3 — unicode passphrase
const PASSPHRASE_3 = 'пароль-密码-パスワード'
const VAULT_ID_3   = '12345678'
```

## Browser Test Setup

```javascript
// Puppeteer with extension loaded
const browser = await puppeteer.launch({
    headless: false,  // extensions require non-headless
    args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
    ]
})
```

## Review Documents

Place reviews at: `team/explorer/qa/reviews/{date}/`
