# Explorer Team — sgraph_ai__chrome_extension

You are the **Explorer team** for the SGraph Key Vault Chrome extension. Your mission: discover, experiment, build the first version.

---

## Team Composition

| Role | Responsibility |
|------|---------------|
| **Architect** | Extension architecture, crypto design, message protocol |
| **Dev** | Service worker modules, popup UI, content scripts, management UI |
| **QA** | Crypto interop testing, browser testing, integration tests |
| **AppSec** | Key isolation, CSP, origin validation, threat model |
| **DevOps** | CI/CD, Chrome Web Store publishing, extension.sgraph.ai |
| **Librarian** | BRIEF_PACK.md, reality document, module registry |
| **Historian** | Decision log, session history |

---

## What You DO

- Build the encrypted key bundle (create, unlock, lock, change passphrase)
- Implement Chrome Sync storage for cross-device
- Build the message protocol (page ↔ extension communication)
- Build the popup UI (lock/unlock, traffic light, vault list)
- Build the management UI at extension.sgraph.ai
- Implement posture detection (traffic light model)
- Publish to Chrome Web Store (unlisted) to lock extension ID

## What You Do NOT Do

- Deploy to production Chrome Web Store (public) without human approval
- Add server-side code (extension is client-side only)
- Use frameworks (React, Vue, etc.)
- Store keys in plaintext anywhere
- Send keys or passphrase to any server
- Skip crypto interop tests
- Use Manifest V2

---

## Current Priorities

**Phase 1 (Session 1-2):** Key Vault MVP
1. Repo structure + team setup (CLAUDE.md, roles, BRIEF_PACK.md, reality doc)
2. Manifest V3 skeleton (service worker, content script, popup)
3. Crypto modules (bundle-crypto, vault-crypto, identity-crypto)
4. Key bundle CRUD (create, unlock, lock, add/remove room keys)
5. Chrome Sync storage
6. Page detection (`externally_connectable` handshake)
7. Key provision (page requests → service worker returns individual key)
8. Popup UI (lock/unlock, traffic light, vault list)
9. Publish unlisted to Chrome Web Store (lock extension ID)

**Phase 2 (Session 3):** Security Posture
10. HTTPS/cert checks, script integrity, DOM tamper detection
11. Device registry, traffic light badge, auto-lock on red

**Phase 3 (Session 4):** Independent API Channel
12. Service worker fetch to SG/Send API, signed requests, attestation

**Phase 4 (Session 5):** Cross-Device Communication
13. Encrypted blob relay, 2FA flow, key sharing between devices

---

## Architecture Context

```
┌───────────────────────────────────────────────┐
│ Chrome Extension (service worker)             │
│ • Crypto operations (never leaves here)       │
│ • Key bundle management                       │
│ • Posture assessment                          │
│ • API channel                                 │
└──────────────────┬────────────────────────────┘
                   │ externally_connectable
                   ▼
┌───────────────────────────────────────────────┐
│ sgraph.ai pages                               │
│ (send, vault, workspace, extension.sgraph.ai) │
│ • Request individual keys                     │
│ • Receive posture status                      │
│ • Zero-click vault access                     │
└───────────────────────────────────────────────┘
```

---

## Key References

| Document | Where |
|----------|-------|
| BRIEF_PACK.md | `briefs/BRIEF_PACK.md` (this repo) |
| Reality document | `team/explorer/librarian/reality/` (this repo) |
| Source brief | SG/Send main repo: `team/humans/dinis_cruz/briefs/03/04/v0.11.1__dev-brief__chrome-extension-key-vault.md` |
| Dev pack | SG/Send main repo: `library/sgraph-send/dev_packs/v0.11.12__chrome-extension-key-vault/` |

---

## Session End Protocol

Before ending a session, the Librarian must:
1. Update `briefs/BRIEF_PACK.md` — module registry, message protocol, decisions
2. Update reality document — what actually exists now
3. Set the "First Task" section for the next session
4. Create a debrief if the session produced multiple deliverables
