# First Session Prompt

**Version:** v0.11.12
**Date:** 5 March 2026
**Purpose:** Copy-paste this into the first Claude Code session for the Chrome extension project

---

## The Prompt

Copy everything below the line and paste it as your first message in a new Claude Code session:

---

```
You are bootstrapping a brand new project: **sgraph_ai__chrome_extension** — the SGraph Key Vault Chrome extension for encrypted key management.

This is a standalone project (separate repo) that builds a Chrome extension (Manifest V3) which:
- Stores an encrypted key bundle in Chrome Sync (useless without the user's passphrase)
- Automatically provides vault/room keys to sgraph.ai pages via `externally_connectable`
- Assesses browser security posture (traffic light: green/amber/red)
- Enables cross-device 2FA via encrypted blob relay

The extension solves key management friction — vaults, workspaces, and data rooms currently need manual key entry every session. With the extension, it's zero-click.

## Step 1: Read the bootstrap pack

The bootstrap pack lives in the SG/Send main repo. Clone it (read-only) and read the documents in order:


git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref


Read these files from the cloned repo, in this order:

1. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__chrome-extension-key-vault/README.md` — index
2. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__chrome-extension-key-vault/07_first-session-brief.md` — your orientation
3. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__chrome-extension-key-vault/BRIEF.md` — full briefing
4. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__chrome-extension-key-vault/architecture.md` — extension architecture
5. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__chrome-extension-key-vault/code-context.md` — crypto source to match
6. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__chrome-extension-key-vault/05_technical-bootstrap-guide.md` — step-by-step setup
7. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__chrome-extension-key-vault/06_what-to-clone.md` — what to copy

Also read the role definitions:
8-14. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__chrome-extension-key-vault/03_role-definitions/ROLE__architect.md` (and dev, qa, appsec, devops, librarian, historian)

And the source brief:
15. `/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/04/v0.11.1__dev-brief__chrome-extension-key-vault.md`

And the crypto source to interoperate with:
16. `/tmp/sgraph-send-ref/sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-vault/sg-vault-crypto.js`
17. `/tmp/sgraph-send-ref/sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/crypto.js`

And the CLAUDE.md templates:
18. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.11.12__chrome-extension-key-vault/09_claude-md-review.md`

## Step 2: Create the repo

After reading all documents, your first task is:

1. Create the repo structure as described in `05_technical-bootstrap-guide.md`
2. Create `.claude/CLAUDE.md` and `.claude/explorer/CLAUDE.md` (from templates)
3. Create `team/explorer/{role}/` directories with README + ROLE files for all 7 roles
4. Create `briefs/BRIEF_PACK.md` with all 10 sections
5. Create initial reality document at `team/explorer/librarian/reality/v0.1.0__what-exists-today.md`
6. Create `extension/manifest.json` (Manifest V3)
7. Implement `vault-crypto.js` with interop tests (GATE — must pass before proceeding)
8. Implement `bundle-crypto.js` (PBKDF2 + AES-256-GCM for key bundle)
9. Implement `identity-crypto.js` (Ed25519)
10. Implement `bundle-store.js` (Chrome Sync CRUD)
11. Implement `key-manager.js` + `key-provider.js` + `message-router.js`
12. Implement `content-script.js` (DOM flag + relay)
13. Build popup UI (lock/unlock, traffic light, vault list)
14. Verify extension loads in Chrome without errors

You are operating as the **Explorer team** with 7 roles: Architect, Dev, QA, AppSec, DevOps, Librarian, Historian. Team structure first, crypto interop second, everything else after.

**Non-negotiable:** Manifest V3. Vanilla JS. ES modules. No frameworks. No build step. All crypto in service worker. Passphrase never stored. Interop tests must pass.
```
