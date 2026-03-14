# First Session Prompt

**Version:** v0.13.30
**Date:** 12 March 2026
**Purpose:** Copy-paste this into the first Claude Code session for the vault project

---

## The Prompt

Copy everything below the line and paste it as your first message in a new Claude Code session:

---

```
You are bootstrapping a brand new project: **SGraph-AI__Vault** — a standalone encrypted vault library with Git-like version control for the SGraph/SPKI ecosystem.

This is a standalone project (separate repo) that provides:
- **Core library** (`sgraph_vault/`) — Vault data model: blobs, trees, commits, branches, encryption, signing
- **Remote backends** — Pluggable sync: SG/Send API, local folder, S3, zip
- **CLI** (`sg-vault`) — Command-line interface for all vault operations

The vault works completely standalone. SG/Send is one remote backend, not a requirement. All operations work offline.

## Step 1: Read the bootstrap pack

The bootstrap pack lives in the SG/Send main repo. Clone it (read-only) and read the documents in order:


git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref


Read these files from the cloned repo, in this order:

1. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.30__vault-standalone/README.md` — index of all documents
2. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.30__vault-standalone/07_first-session-brief.md` — your orientation
3. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.30__vault-standalone/BRIEF.md` — full briefing
4. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.30__vault-standalone/architecture.md` — data model, crypto, branch model
5. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.30__vault-standalone/code-context.md` — source code to reference
6. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.30__vault-standalone/05_technical-bootstrap-guide.md` — step-by-step setup
7. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.30__vault-standalone/06_what-to-clone.md` — what to reference

Also read the role definitions:
8-14. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.30__vault-standalone/03_role-definitions/ROLE__*.md` (all 7 roles)

And the comprehensive vault debrief (synthesises all 65 vault documents):
15. `/tmp/sgraph-send-ref/team/humans/dinis_cruz/debriefs/03/12/v0.13.30__debrief__vault-architecture-comprehensive.md`

And the key architecture briefs:
16. `/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/12/v0.13.30__arch-brief__branch-model-multi-user.md`
17. `/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/12/v0.13.30__arch-brief__bare-vault-unification.md`
18. `/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/12/v0.13.30__arch-brief__cli-standalone-remotes.md`

And the CLAUDE.md templates:
19. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.13.30__vault-standalone/09_claude-md-review.md`

## Step 2: Create the repo

After reading all documents, your first task is:

1. Create the SGraph-AI__Vault repo structure as described in `05_technical-bootstrap-guide.md`
2. Create `.claude/CLAUDE.md` and `.claude/explorer/CLAUDE.md` (from templates)
3. Create `team/explorer/{role}/` directories with README.md + ROLE__{name}.md for all 7 roles
4. Create `pyproject.toml` with correct dependencies
5. Implement `Vault_Blob`, `Vault_Tree`, `Vault_Commit` using Type_Safe
6. Implement `Vault` class with create/add/commit
7. Implement AES-256-GCM encryption (encrypt_blob, decrypt_blob) — must match Web Crypto format
8. Implement key management (generate, export, import)
9. Implement local folder remote (push/pull)
10. Implement basic CLI (init, add, commit, status)
11. Write tests (target: 15+ passing)
12. Create initial reality document

You are operating as the **Explorer team** with 7 roles: Architect, Dev, AppSec, DevOps, QA, Librarian, Historian. Team structure first, then core objects, then encryption, then tests.

**Non-negotiable:** Type_Safe (never Pydantic). osbot-aws (never boto3). No mocks in tests. Server never sees plaintext. Content-addressed storage. AES-256-GCM matching Web Crypto format. Offline-first.
```
