# sgraph_ai__chrome_extension — Agent Guidance

**Read this before starting any task.** This file is the single source of truth for all agents and roles working on the SGraph Key Vault Chrome extension.

---

## MEMORY.md Policy

**Do NOT use MEMORY.md.** All persistent project knowledge is maintained by the Librarian via `briefs/BRIEF_PACK.md`.

---

## Reality Document — MANDATORY CHECK

**Before describing, assessing, or assuming what the extension can do, READ:**

`team/explorer/librarian/reality/{version}__what-exists-today.md`

### Rules (Non-Negotiable)

1. **If the reality document doesn't list it, it does not exist.**
2. **Proposed features must be labelled.** Write: "PROPOSED — does not exist yet."
3. **Update the reality document when you change code.** Same commit.

---

## Team Structure: Explorer

This project operates as a single **Explorer team** with 7 roles:

| Role | Responsibility |
|------|---------------|
| **Architect** | Extension architecture, crypto design, message protocol, manifest permissions |
| **Dev** | Service worker modules, popup UI, content scripts, management UI |
| **QA** | Crypto interop testing, browser testing, integration tests |
| **AppSec** | Key isolation, CSP, origin validation, posture detection, threat model |
| **DevOps** | CI/CD, Chrome Web Store publishing, extension.sgraph.ai deployment |
| **Librarian** | BRIEF_PACK.md, reality document, module registry |
| **Historian** | Decision tracking, session history |

---

## Project

**SGraph Key Vault** — a Chrome extension that turns key management into a background service for the SGraph ecosystem.

Keys are encrypted with a user-chosen passphrase, stored in Chrome Sync, and automatically provided to sgraph.ai pages. The SG/Send server never sees the keys. Zero-knowledge preserved.

**Version file:** `extension/version`

---

## Stack

| Layer | Technology | Rule |
|-------|-----------|------|
| Platform | Chrome Extension (Manifest V3) | No Manifest V2 |
| Language | Vanilla JavaScript (ES modules) | No frameworks, no build step |
| Crypto | Web Crypto API | AES-256-GCM, PBKDF2, Ed25519 |
| Storage | chrome.storage.sync / session / local | No localStorage, no IndexedDB |
| Page API | `externally_connectable` | Private channel to sgraph.ai pages |
| Identity | Ed25519 key pair | For signing and PKI |
| Management UI | Static HTML/CSS/JS at extension.sgraph.ai | S3 + CloudFront |
| Publishing | Chrome Web Store | Automated via API |

---

## Key Rules

### Code Patterns

1. **No frameworks** — vanilla JS, HTML, CSS only
2. **ES modules in service worker** — `"type": "module"` in manifest
3. **No build step** — every file deployable as-is
4. **Named exports only** — no default exports
5. **JSDoc** on every exported function
6. **No localStorage** — Chrome storage APIs only
7. **No eval(), no new Function()** — ever
8. **No inline scripts** — CSP prevents, verify in manifest

### Security (Non-Negotiable)

9. **Passphrase never stored** — in memory during derivation only
10. **Master key in service worker memory only** — never in storage, never sent to page
11. **Individual keys returned** — never the full bundle
12. **Origin validation** — reject messages from non-sgraph.ai origins
13. **Keys cleared on lock** — no dangling references
14. **Red posture locks keys** — automatic, immediate
15. **Encrypted bundle only in Chrome Sync** — the only persisted artefact

### Crypto Interop

16. **Same KDF parameters as vault crypto** — PBKDF2, 600k iterations, same salt format
17. **Same AES-256-GCM as send crypto** — same wire format (nonce + ciphertext + tag)
18. **Interop test vectors** — generate from browser, verify in extension

### Git

19. **Default branch:** `dev`
20. **Feature branches** branch from `dev`
21. **Branch naming:** `claude/{description}-{session-id}`
22. **Always push with:** `git push -u origin {branch-name}`

---

## Role System

Each role produces review documents at `team/explorer/{role}/reviews/`. The Librarian maintains the master index.

**Dinis Cruz** is the human stakeholder. His briefs live in `team/humans/dinis_cruz/briefs/` — **read-only for agents**.

Before starting work, check:
1. **BRIEF_PACK.md** at `briefs/BRIEF_PACK.md`
2. **Reality document** — what actually exists
3. Latest human brief in `team/humans/dinis_cruz/briefs/`
4. Your role's previous reviews

---

## Key Documents

| Document | Location |
|----------|----------|
| **BRIEF_PACK.md** | `briefs/BRIEF_PACK.md` |
| **Reality document** | `team/explorer/librarian/reality/` |
| **Source brief** | SG/Send main repo: `team/humans/dinis_cruz/briefs/03/04/v0.11.1__dev-brief__chrome-extension-key-vault.md` |
| **Dev pack** | SG/Send main repo: `library/sgraph-send/dev_packs/v0.11.12__chrome-extension-key-vault/` |
| **Vault crypto source** | SG/Send main repo: `sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-vault/sg-vault-crypto.js` |
| **Send crypto source** | SG/Send main repo: `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/crypto.js` |
