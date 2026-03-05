# Dev Pack: SGraph Key Vault — Chrome Extension for Encrypted Key Management

**Version:** v0.11.12
**Date:** 2026-03-05
**Objective:** Set up `sgraph_ai__chrome_extension` repo, build Phase 1 MVP (encrypted key bundle, Chrome Sync, page integration)

---

## Reading Order

| # | File | Purpose |
|---|------|---------|
| 1 | [`07_first-session-brief.md`](07_first-session-brief.md) | **Start here** — orientation for a new Claude Code session |
| 2 | [`BRIEF.md`](BRIEF.md) | Full briefing: what to build, constraints, phases, acceptance criteria |
| 3 | [`architecture.md`](architecture.md) | Extension architecture, data model, crypto, message protocol, manifest |
| 4 | [`code-context.md`](code-context.md) | Existing crypto source code the extension must interoperate with |
| 5 | [`03_role-definitions/`](03_role-definitions/) | 7 roles and their responsibilities |
| 6 | [`05_technical-bootstrap-guide.md`](05_technical-bootstrap-guide.md) | Step-by-step repo setup instructions |
| 7 | [`06_what-to-clone.md`](06_what-to-clone.md) | What to reference from the SG/Send main repo |
| 8 | [`08_first-session-prompt.md`](08_first-session-prompt.md) | Copy-paste prompt to bootstrap a new session |
| 9 | [`09_claude-md-review.md`](09_claude-md-review.md) | How to adapt CLAUDE.md for the extension project |
| 10 | [`addenda/appsec.md`](addenda/appsec.md) | Security: key isolation, CSP, externally_connectable, Chrome Sync |
| 11 | [`addenda/devops.md`](addenda/devops.md) | CI/CD, Chrome Web Store publishing, testing pipeline |
| 12 | [`reference/briefs-index.md`](reference/briefs-index.md) | Index of source briefs |

## Role Definitions

| Role | File |
|------|------|
| Architect | [`03_role-definitions/ROLE__architect.md`](03_role-definitions/ROLE__architect.md) |
| Dev | [`03_role-definitions/ROLE__dev.md`](03_role-definitions/ROLE__dev.md) |
| QA | [`03_role-definitions/ROLE__qa.md`](03_role-definitions/ROLE__qa.md) |
| AppSec | [`03_role-definitions/ROLE__appsec.md`](03_role-definitions/ROLE__appsec.md) |
| DevOps | [`03_role-definitions/ROLE__devops.md`](03_role-definitions/ROLE__devops.md) |
| Librarian | [`03_role-definitions/ROLE__librarian.md`](03_role-definitions/ROLE__librarian.md) |
| Historian | [`03_role-definitions/ROLE__historian.md`](03_role-definitions/ROLE__historian.md) |

## CLAUDE.md Templates

| Template | File |
|----------|------|
| Main CLAUDE.md | [`claude-md-templates/CLAUDE.md`](claude-md-templates/CLAUDE.md) |
| Explorer CLAUDE.md | [`claude-md-templates/explorer__CLAUDE.md`](claude-md-templates/explorer__CLAUDE.md) |

---

## Quick Start

```bash
# The target repo (to be created):
git clone [repo-url] sgraph_ai__chrome_extension
cd sgraph_ai__chrome_extension

# Load as unpacked extension in Chrome:
# 1. chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" → select the extension/ directory
```

---

## Summary

This dev pack bootstraps a new Claude Code session to build the **SGraph Key Vault** Chrome extension — the missing piece that makes vaults, workspaces, data rooms, and PKI usable for real daily work.

The extension:
- **Stores encrypted key bundles** in Chrome Sync (useless without the user's passphrase)
- **Automatically provides keys** to sgraph.ai pages (zero-click vault access)
- **Assesses security posture** (traffic light: green/amber/red)
- **Enables cross-device 2FA** via encrypted blob relay through SG/Send API
- **Preserves zero-knowledge** — the SG/Send server never sees keys or passphrases

Source brief: `team/humans/dinis_cruz/briefs/03/04/v0.11.1__dev-brief__chrome-extension-key-vault.md`

**Definition of done (Phase 1):** Extension creates/unlocks encrypted key bundle, syncs via Chrome Sync, provides keys to sgraph.ai pages via `externally_connectable`, popup shows lock/unlock + traffic light, published to Chrome Web Store (unlisted) to lock extension ID.
