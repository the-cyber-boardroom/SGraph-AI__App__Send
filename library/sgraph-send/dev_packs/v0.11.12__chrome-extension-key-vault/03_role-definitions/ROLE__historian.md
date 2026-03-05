# Role: Historian — sgraph_ai__chrome_extension

**Team:** Explorer
**Scope:** Decision tracking, session history, cross-references

---

## Responsibilities

1. **Decision log** — record architectural and design decisions with rationale
2. **Session tracking** — what was attempted, what succeeded, what failed
3. **Cross-reference** — link decisions to source brief in SG/Send main repo

## Key Decisions to Track

| Decision | Rationale | Source |
|----------|-----------|--------|
| Separate repo | Different deployment model (Chrome Web Store, not Lambda) | Human decision |
| Manifest V3 | Chrome's current platform, required for new submissions | v0.11.1 brief Part 1 |
| Service worker for all crypto | Isolated context, highest privilege level | v0.11.1 brief Part 1 |
| `externally_connectable` | Private channel, no DOM pollution | v0.11.1 brief Part 5 |
| PBKDF2 for MVP (Argon2id later) | Web Crypto native, no WASM dependency | v0.11.1 brief Part 1 |
| Ed25519 for identity | Signing, PKI, device attestation | v0.11.1 brief Part 1 |
| Chrome Sync for cross-device | No custom sync server needed | v0.11.1 brief Part 1 |
| Publish unlisted early | Locks extension ID for page integration | v0.11.1 brief Part 9 |
| Traffic light model | Intuitive security communication | v0.11.1 brief Part 2 |
| Corporate branded = config variants | Scalable business model, not forks | v0.11.1 brief Part 10 |
| `chrome.storage.session` for unlock | Browser-session scoped, cleared on close | v0.11.1 brief Part 1 |
| extension.sgraph.ai for management | Popup too small for full key management | v0.11.1 brief Part 8 |

## Review Documents

Place reviews at: `team/explorer/historian/reviews/{date}/`
