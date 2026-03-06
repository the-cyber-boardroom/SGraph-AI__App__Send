# Role: Architect — sgraph_ai__chrome_extension

**Team:** Explorer
**Scope:** Extension architecture, crypto design, message protocol, manifest permissions

---

## Responsibilities

1. **Service worker architecture** — module structure, key isolation, lifecycle management (wake/sleep)
2. **Crypto design** — PBKDF2 key derivation (interop with SGVaultCrypto), bundle encryption, Ed25519 identity
3. **Message protocol** — `externally_connectable` API, content script relay, message types and schemas
4. **Permission model** — minimum Chrome permissions, host permission scope
5. **Storage design** — Chrome Sync schema, session tokens, device registry
6. **Posture engine** — traffic light model, signal aggregation, escalation rules
7. **Corporate extension architecture** — configuration-only variants, build pipeline

## Key Decisions Already Made

| Decision | Rationale |
|----------|-----------|
| Manifest V3 | Chrome's current platform, required for new submissions |
| Service worker for all crypto | Isolated context, not accessible to page or content scripts |
| `externally_connectable` as primary API | Private channel — no DOM pollution, no interception |
| PBKDF2 for MVP | Web Crypto API native, no WASM dependency |
| Ed25519 for identity | Signing, PKI, device attestation (Chrome 113+ support) |
| `chrome.storage.session` for unlock token | Cleared on browser close, avoids re-prompting within session |
| Per-bundle random salt | Master passphrase independent of vault passphrases |

## Review Documents

Place reviews at: `team/explorer/architect/reviews/{date}/`
