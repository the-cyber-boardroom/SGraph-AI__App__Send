# Role: AppSec — sgraph_ai__chrome_extension

**Team:** Explorer
**Scope:** Extension security model, key isolation, CSP, origin validation, posture detection

---

## Responsibilities

1. **Key isolation review** — verify keys never leak to content scripts, pages, console, network, or storage in plaintext
2. **Origin validation** — `externally_connectable` only responds to declared sgraph.ai origins
3. **Content Security Policy** — manifest CSP prevents inline scripts, remote code execution
4. **Message injection testing** — attempt to send messages from non-sgraph.ai pages (must fail)
5. **DOM tamper detection review** — verify MutationObserver catches injected scripts/iframes
6. **Monkey-patch detection** — verify extension detects overwritten `fetch`, `crypto.subtle`, etc.
7. **Chrome Sync security** — encrypted bundle is the only stored artefact, verify no plaintext leaks
8. **Service worker memory** — verify all keys cleared on lock, no dangling references
9. **Supply chain** — no third-party dependencies in extension (pure Web Crypto API + Chrome APIs)

## Security Invariants (Must Always Hold)

| # | Invariant | How to Verify |
|---|-----------|--------------|
| S1 | Passphrase never stored anywhere | Grep all storage writes, verify no passphrase field |
| S2 | Master key only in service worker memory | Grep all `postMessage`, `sendMessage`, storage writes |
| S3 | Individual keys returned, never full bundle | Review `key-provider.js` — single key per response |
| S4 | Messages rejected from non-sgraph.ai origins | Test with page on evil.com sending `sendMessage` |
| S5 | Encrypted bundle only in Chrome Sync | Review `bundle-store.js` — only ciphertext saved |
| S6 | Keys cleared on lock | Review lock function — no references retained |
| S7 | Red posture locks keys immediately | Review posture engine → key manager integration |
| S8 | No inline scripts in popup/options | Verify CSP in manifest, no `onclick` attributes |
| S9 | Ed25519 private key never leaves service worker | Review all message responses |
| S10 | No `eval()`, no `new Function()` | Grep entire codebase |

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| Malicious page sends `sendMessage` | `externally_connectable` restricts to `*.sgraph.ai` |
| Other extension intercepts messages | `externally_connectable` is a private channel |
| Content script in shared DOM | Content script only relays, never handles keys |
| XSS on sgraph.ai page | Extension verifies origin, page never sees full bundle |
| Compromised sgraph.ai server | Script integrity checks, posture → red, keys locked |
| Physical device access | Bundle encrypted with passphrase, no plaintext on disk |
| Chrome Sync compromise | Bundle is AES-256-GCM encrypted, useless without passphrase |
| Service worker termination | Session token in `chrome.storage.session` (browser-session scoped) |

## Review Documents

Place reviews at: `team/explorer/appsec/reviews/{date}/`
