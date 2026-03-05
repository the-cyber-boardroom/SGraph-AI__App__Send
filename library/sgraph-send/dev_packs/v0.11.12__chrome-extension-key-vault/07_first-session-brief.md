# First Session Brief

**Version:** v0.11.12
**Date:** 5 March 2026
**Purpose:** Orientation for the first Claude Code session on the Chrome extension repo

---

## Who You Are

You are the **Explorer team** for the SGraph Key Vault Chrome extension. You have 7 roles: Architect, Dev, QA, AppSec, DevOps, Librarian, Historian.

## What You're Building

A Chrome extension (Manifest V3) that:
- Stores an encrypted key bundle in Chrome Sync (useless without the user's passphrase)
- Automatically provides vault/room keys to sgraph.ai pages via `externally_connectable`
- Assesses the browser security posture (traffic light: green/amber/red)
- Enables cross-device 2FA via encrypted blob relay through SG/Send API

This solves the key management friction that currently makes vaults, workspaces, and data rooms require manual key entry every session.

## What You Already Know

The architecture has been fully designed. Read the 11-part source brief:

```
/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/04/v0.11.1__dev-brief__chrome-extension-key-vault.md
```

Key decisions are already made (see `03_role-definitions/ROLE__historian.md` for the full list).

## Your First Session Goals

**Team setup first. Crypto interop second. Key bundle CRUD third. Page integration fourth.**

### Session 1 Deliverables

1. **Repo skeleton** — extension directory structure, manifest.json
2. **CLAUDE.md files** — main + explorer team (from templates)
3. **Team structure** — `team/explorer/{role}/` with README + ROLE files for all 7 roles
4. **BRIEF_PACK.md** — 10-section session bootstrap at `briefs/BRIEF_PACK.md`
5. **Reality document** — initial `team/explorer/librarian/reality/v0.1.0__what-exists-today.md`
6. **vault-crypto.js** — port of SGVaultCrypto with interop tests (GATE)
7. **bundle-crypto.js** — PBKDF2 + AES-256-GCM for key bundle
8. **identity-crypto.js** — Ed25519 key generation + signing
9. **bundle-store.js** — Chrome Sync CRUD for encrypted bundle
10. **key-manager.js** — unlock/lock/add room/remove room
11. **message-router.js** — handle `externally_connectable` messages
12. **content-script.js** — DOM flag + postMessage relay
13. **Popup UI** — lock/unlock, traffic light placeholder, vault list
14. **Extension loads in Chrome** — no errors, health check responds

### Reading Order

1. This file (you're reading it)
2. `BRIEF.md` — full briefing with phases, data model, message protocol, crypto params
3. `architecture.md` — file structure, manifest, module graph, communication flows
4. `code-context.md` — existing crypto source code (must match exactly)
5. `05_technical-bootstrap-guide.md` — step-by-step repo setup
6. `06_what-to-clone.md` — what to reference from the SG/Send main repo

Then role definitions:
7. `03_role-definitions/ROLE__architect.md`
8. `03_role-definitions/ROLE__dev.md`
9. `03_role-definitions/ROLE__qa.md`
10. `03_role-definitions/ROLE__appsec.md`
11. `03_role-definitions/ROLE__devops.md`
12. `03_role-definitions/ROLE__librarian.md`
13. `03_role-definitions/ROLE__historian.md`

And the source brief:
14. `/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/04/v0.11.1__dev-brief__chrome-extension-key-vault.md`

And the crypto source to interoperate with:
15. `/tmp/sgraph-send-ref/sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-vault/sg-vault-crypto.js`
16. `/tmp/sgraph-send-ref/sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/crypto.js`

And the CLAUDE.md templates:
17. `09_claude-md-review.md`

## Critical Reminders

- **Manifest V3 only.** No Manifest V2.
- **Vanilla JS only.** No frameworks, no build step.
- **ES modules in service worker.** `"type": "module"` in manifest.
- **All crypto in service worker.** Never in content scripts or page context.
- **Passphrase never stored.** In memory during derivation only, then discarded.
- **Interop test gate.** `vault-crypto.js` must produce identical output to `SGVaultCrypto`.
- **Team structure before features.** CLAUDE.md, roles, BRIEF_PACK.md before crypto code.
- **Publish unlisted early.** Lock the extension ID for page integration.
- **No localStorage.** Chrome storage APIs only.
