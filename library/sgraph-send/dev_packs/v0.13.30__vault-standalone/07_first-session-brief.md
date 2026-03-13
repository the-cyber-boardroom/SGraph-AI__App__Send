# First Session Brief

**Version:** v0.13.30
**Date:** 12 March 2026
**Purpose:** Orientation for the first Claude Code session on the SGraph-AI__Vault repo

---

## Who You Are

You are the **Explorer team** for the SGraph-AI__Vault project. You have 7 roles: Architect, Dev, AppSec, DevOps, QA, Librarian, Historian.

## What You're Building

A standalone encrypted vault library published to PyPI as `sgraph-vault`. Three layers:

- **Core library** (`sgraph_vault/`) — Vault data model: blobs, trees, commits, branches, encryption, signing. All operations work offline.
- **Remote backends** (`sgraph_vault/remote/`) — Pluggable sync: SG/Send API, local folder, S3, zip. Network only needed for sync.
- **CLI** (`sg-vault`) — Command-line interface for all vault operations.

The vault is the core data primitive for the SGraph/SPKI platform. SG/Send is one remote backend, not a requirement. Someone using only the CLI and a local folder has the full feature set.

## What Already Exists (In Other Repos)

In the SG/Send main repo (`SGraph-AI__App__Send`):
- Vault pointer routes (HTTP API for vault CRUD)
- vault-crypto.js (browser AES-256-GCM — format we must match)
- 584 tests (some covering vault operations)

In the CLI repo (`sg-send-cli` on PyPI):
- 5 commands: clone, pull, push, status, init
- SG/Send API integration for vault operations

These are reference implementations. The vault library will replace the logic; those repos will import the library.

## Your First Session Goals

**Repo structure first. Core objects second. Encryption third. Tests throughout.**

### Session 1 Deliverables

1. **Repo skeleton** — full directory structure, pyproject.toml, version file
2. **CLAUDE.md files** — main + explorer team (from templates)
3. **Team structure** — `team/explorer/{role}/` with README.md + ROLE files for all 7 roles
4. **Core objects** — `Vault_Blob`, `Vault_Tree`, `Vault_Commit` with Type_Safe
5. **Vault class** — `Vault.create()`, `vault.add()`, `vault.commit()` working
6. **Encryption** — `encrypt_blob()` / `decrypt_blob()` with AES-256-GCM
7. **Key management** — `generate_vault_key()`, `export_key()`, `import_key()`
8. **Local remote** — push/pull to a local folder
9. **Basic CLI** — `sg-vault init`, `sg-vault add`, `sg-vault commit`, `sg-vault status`
10. **Tests** — at least 15 passing tests covering core operations
11. **Reality document** — `team/explorer/librarian/reality/v0.1.0__what-exists-today.md`

### Reading Order

1. This file (you're reading it)
2. `BRIEF.md` — full briefing with phases, constraints, specifications
3. `architecture.md` — vault data model, object format, crypto, branch model
4. `code-context.md` — source code to extract (crypto format, API patterns)
5. `05_technical-bootstrap-guide.md` — step-by-step repo setup
6. `06_what-to-clone.md` — what to reference from SG/Send main repo

Then read the role definitions:
7. `03_role-definitions/ROLE__architect.md`
8. `03_role-definitions/ROLE__dev.md`
9. `03_role-definitions/ROLE__appsec.md`
10. `03_role-definitions/ROLE__devops.md`
11. `03_role-definitions/ROLE__qa.md`
12. `03_role-definitions/ROLE__librarian.md`
13. `03_role-definitions/ROLE__historian.md`

And the key briefs from the SG/Send main repo:
14. Vault Comprehensive Debrief: `team/humans/dinis_cruz/debriefs/03/12/v0.13.30__debrief__vault-architecture-comprehensive.md`
15. Branch Model: `team/humans/dinis_cruz/briefs/03/12/v0.13.30__arch-brief__branch-model-multi-user.md`
16. Bare Vault Unification: `team/humans/dinis_cruz/briefs/03/12/v0.13.30__arch-brief__bare-vault-unification.md`

And the CLAUDE.md templates:
17. `09_claude-md-review.md`

## Critical Reminders

- **Type_Safe only.** Never Pydantic. All schemas use Type_Safe from osbot-utils.
- **osbot-aws for S3.** Never boto3 directly.
- **No mocks in tests.** Real implementations, in-memory backends.
- **Server never sees plaintext.** Encryption is client-side. Server stores ciphertext.
- **Content-addressed storage.** Blob ID = SHA-256 of encrypted content.
- **Offline-first.** All operations work without network. Remote sync is optional.
- **AES-256-GCM format must match browser.** `[IV 12 bytes][Ciphertext][Auth Tag 16 bytes]`.
- **Team structure before features.** CLAUDE.md, roles, reality doc before writing vault code.
