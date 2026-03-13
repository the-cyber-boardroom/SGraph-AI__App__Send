# SGraph-AI__Vault — Dev Pack

**Version:** v0.13.30
**Date:** 2026-03-12
**Pack type:** Workstream (full pack)
**Target audience:** LLM coding session (Claude Code)
**Objective:** Build a standalone encrypted vault library with Git-like version control, published to PyPI as `sgraph-vault`

---

## What You Are Building

A **standalone encrypted vault library and CLI** that provides content-addressed encrypted storage with Git-like version control. This involves:

1. **Core library** (`sgraph_vault`) — Vault data model: blobs, trees, commits, branches, encryption, signing
2. **Branch model** — PKI per branch, signed commits, merge-only main, conflict detection
3. **Remote backends** — SG/Send API, local folder, S3, zip, URL (pluggable abstraction)
4. **CLI** (`sg-vault`) — clone, push, pull, branch, merge, sign, export, remote management
5. **Pack system** — Self-describing vaults with `_pack.json` manifest for UI configuration
6. **Tests** — Full suite, no mocks, in-memory backends, crypto round-trip verification

The vault is the core data primitive for the entire SPKI platform. SG/Send is one remote backend, not a requirement. The library works completely standalone for local operations.

---

## Key Constraints

| Constraint | Detail |
|-----------|--------|
| **Type_Safe only** | All schemas use `Type_Safe` from `osbot-utils`. Never Pydantic. |
| **osbot-aws for S3** | All AWS operations via `osbot-aws`. Never boto3 directly. |
| **No mocks in tests** | Real implementations, in-memory backends. ~100ms startup. |
| **Server never sees plaintext** | Encryption is client-side only. Server stores ciphertext. |
| **Content-addressed storage** | Blob ID = SHA-256 of encrypted content. |
| **Offline-first** | All vault operations work without network. Remote sync is optional. |
| **AES-256-GCM** | Blob encryption. Web Crypto API compatible format. |
| **Signed commits** | Every commit signed by branch key. Mandatory, not optional. |
| **Pre-launch format** | No backwards compatibility debt. Break freely. Version field for future. |
| **Python 3.12 / arm64** | Same runtime as SG/Send. |

---

## Where This Fits in the Architecture

```
BEFORE (current — vault logic embedded in App__Send):

SGraph-AI__App__Send
  sgraph_ai_app_send/
    lambda__user/Routes__Vault__Pointer.py    <- Vault HTTP API (thin)
    lambda__admin/Routes__Vault__Pointer.py   <- Vault HTTP API (thin)
  sgraph_ai_app_send__ui__admin/
    vault-crypto.js                           <- Browser encryption
  sg-send-cli (PyPI)
    clone, push, pull, status, init           <- CLI (vault-aware)

AFTER (proposed — vault extracted to standalone library):

SGraph-AI__Vault (THIS REPO)
  sgraph_vault/
    vault.py                                  <- Core data model
    objects/ (blob, tree, commit)             <- Content-addressed objects
    branch/ (branch, merge)                   <- Branch model + PKI
    crypto/ (encrypt, sign, keys)             <- AES-256-GCM + signing
    remote/ (sgraph, local, s3, zip)          <- Pluggable backends
    pack/ (manifest, themes)                  <- Self-describing vaults
    cli/ (all commands)                       <- sg-vault CLI

SGraph-AI__App__Send
  imports sgraph-vault as dependency
  Routes__Vault__Pointer.py delegates to sgraph_vault library
  UI imports from vault library's JS components

sg-send-cli
  imports sgraph-vault for vault operations
  adds transfer API (not vault responsibility)
```

---

## 6 Phases

### Phase 1: Core Library (Foundation)

1. Create `SGraph-AI__Vault` repo with proper structure
2. Implement `Vault`, `Blob`, `Tree`, `Commit` classes using `Type_Safe`
3. Content-addressed storage: blob ID = SHA-256 hash
4. In-memory storage backend for tests
5. Basic create/add/commit cycle working
6. Tests: create vault, add files, commit, verify tree

### Phase 2: Encryption Layer

7. AES-256-GCM encrypt/decrypt for blobs
8. Key generation and management (symmetric vault key)
9. Round-trip tests: create → encrypt → store → retrieve → decrypt → verify
10. Base64url encoding for key export (Web Crypto compatible)

### Phase 3: Branch Model + Signed Commits

11. Branch creation with key pair generation (ECDSA P-256)
12. Auto-create branch on clone
13. All commits signed by branch private key
14. Signature verification
15. Push always succeeds (branch uniqueness)
16. Merge: auto-merge for non-conflicting, conflict detection for overlapping

### Phase 4: Remotes

17. Abstract `Remote` interface
18. Local folder backend (push/pull to filesystem)
19. SG/Send API backend (port from sg-send-cli)
20. S3 backend (via osbot-aws)
21. Zip export/import backend
22. `vault.remote_add()` / `vault.remote_remove()` / `vault.remote_list()`

### Phase 5: CLI

23. `sg-vault init` — create vault (local or remote)
24. `sg-vault clone` — clone from any remote
25. `sg-vault add/commit` — stage and commit files
26. `sg-vault push/pull` — sync with remote
27. `sg-vault branch/merge` — branch management
28. `sg-vault log --graph` — commit history (ASCII art)
29. `sg-vault sign/verify` — document signing
30. `sg-vault export --zip` — distributable archive
31. `sg-vault remote add/remove/list` — remote management
32. `sg-vault --headless` — programmatic mode (no prompts, exit codes)

### Phase 6: Pack Manifest + Self-Describing Vaults

33. `_pack.json` schema definition
34. Pack type registry (investor, ERM, customer, compliance)
35. Manifest reader/writer
36. Vault creation with pack configuration

---

## Files to Read First

Before starting, clone the SG/Send main repo for reference (read-only):

```bash
git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref
```

### Source Code (what you're extracting from)

1. **Vault pointer routes:** `sgraph_ai_app_send/lambda__user/` — `Routes__Vault__Pointer.py` — the HTTP API layer
2. **vault-crypto.js:** `sgraph_ai_app_send__ui__admin/` — Web Crypto AES-256-GCM implementation
3. **sg-send-cli:** The existing PyPI package — vault operations (clone, push, pull, status, init)

### Vault Briefs (the requirements — 20 documents)

See [`reference/briefs-index.md`](reference/briefs-index.md) for the full index. Key ones:

4. **Branch Model:** `team/humans/dinis_cruz/briefs/03/12/v0.13.30__arch-brief__branch-model-multi-user.md`
5. **Bare Vault Unification:** `team/humans/dinis_cruz/briefs/03/12/v0.13.30__arch-brief__bare-vault-unification.md`
6. **CLI Standalone + Remotes:** `team/humans/dinis_cruz/briefs/03/12/v0.13.30__arch-brief__cli-standalone-remotes.md`
7. **Encrypt for Reader:** `team/humans/dinis_cruz/briefs/03/11/v0.13.29__arch-brief__encrypt-for-reader.md`
8. **Lambda Vault Logging:** `team/humans/dinis_cruz/briefs/03/11/v0.13.29__dev-brief__lambda-vault-logging.md`

### Architecture References

9. **Vault Comprehensive Debrief:** `team/humans/dinis_cruz/debriefs/03/12/v0.13.30__debrief__vault-architecture-comprehensive.md` — full synthesis of all 65 vault documents
10. **CLI PKI Algorithm Decisions:** `team/roles/architect/reviews/03/11/v0.13.19__guidance__cli-pki-algorithm-decisions.md`
11. **CLI PKI Implementation Patterns:** `team/roles/dev/reviews/03/11/v0.13.19__guidance__cli-pki-implementation-patterns.md`
12. **Reality Document:** `team/roles/librarian/reality/v0.13.22__what-exists-today.md`

---

## Human Decisions (already made — follow these)

| Question | Answer |
|----------|--------|
| Schema system? | **Type_Safe** from osbot-utils. Never Pydantic. |
| AWS access? | **osbot-aws** only. Never boto3 directly. |
| Blob encryption? | **AES-256-GCM.** Same as SG/Send. Web Crypto compatible. |
| Signing algorithm? | **ECDSA P-256** for browser compat (pending — Ed25519 for CLI-only is acceptable) |
| Branch model? | **Auto-create on clone.** Every branch gets its own key pair. |
| Merge model? | **Merge-only main.** No direct commits to main. Auto-merge for non-conflicting. |
| Commit signing? | **Mandatory.** Every commit signed by branch key. |
| Remote model? | **Git-style.** `remote add/remove/list`. Pluggable backends. |
| Vault format? | **Pre-launch.** No backwards compatibility. Break freely. Add version field. |
| File names in tree? | **Plaintext for now.** Encryption option later. |
| Package name? | **sgraph-vault** (pending human confirmation) |
| CLI command? | **sg-vault** (standalone, separate from sg-send-cli) |
| Testing? | **No mocks, no patches.** In-memory backends. Full round-trips. |

---

## Vault Object Format

### Blob

```
blob_id = SHA-256(encrypted_content)
stored as: objects/blobs/{blob_id}
content: IV (12 bytes) + AES-256-GCM ciphertext
```

### Tree

```json
{
  "entries": {
    "README.md": {"blob_id": "abc123...", "size": 1024},
    "docs/spec.md": {"blob_id": "def456...", "size": 2048}
  }
}
tree_id = SHA-256(canonical JSON of entries)
stored as: objects/trees/{tree_id}
```

### Commit

```json
{
  "tree": "tree_id_hash",
  "parent": "parent_commit_hash or null",
  "message": "commit message",
  "timestamp": "2026-03-12T10:30:00Z",
  "branch": "branch_public_key_fingerprint",
  "signature": "ECDSA signature over (tree + parent + message + timestamp + branch)"
}
commit_id = SHA-256(canonical JSON)
stored as: objects/commits/{commit_id}
```

### Branch

```json
{
  "name": "clone-abc123",
  "head": "commit_id",
  "public_key": "base64url encoded ECDSA P-256 public key",
  "created": "2026-03-12T10:30:00Z"
}
stored as: refs/heads/{branch_name}
```

### Vault Config

```json
{
  "version": "0.1",
  "vault_id": "unique_vault_identifier",
  "created": "2026-03-12T10:30:00Z",
  "remotes": {
    "origin": {"type": "sgraph", "url": "https://send.sgraph.ai", "vault_id": "abc123"}
  },
  "default_branch": "main"
}
stored as: .vault/config.json
```

---

## Module Registry

| Module | Purpose | Status | Key Exports |
|--------|---------|--------|-------------|
| `sgraph_vault.vault` | Main Vault class | To build | `Vault`: create, add, commit, push, pull, clone |
| `sgraph_vault.objects.blob` | Encrypted blob | To build | `Blob`: create, encrypt, decrypt, hash |
| `sgraph_vault.objects.tree` | Tree (path→blob mapping) | To build | `Tree`: add_entry, remove_entry, hash |
| `sgraph_vault.objects.commit` | Signed commit | To build | `Commit`: create, sign, verify |
| `sgraph_vault.branch.branch` | Branch management | To build | `Branch`: create, list, switch, delete |
| `sgraph_vault.branch.merge` | Merge + conflict detection | To build | `merge`, `detect_conflicts` |
| `sgraph_vault.crypto.encrypt` | AES-256-GCM | To build | `encrypt_blob`, `decrypt_blob` |
| `sgraph_vault.crypto.sign` | ECDSA signing | To build | `sign_commit`, `verify_commit` |
| `sgraph_vault.crypto.keys` | Key generation/storage | To build | `generate_key_pair`, `export_key`, `import_key` |
| `sgraph_vault.remote.remote` | Abstract interface | To build | `Remote` base class |
| `sgraph_vault.remote.remote_local` | Local folder | To build | push/pull to filesystem |
| `sgraph_vault.remote.remote_sgraph` | SG/Send API | To port | push/pull to send.sgraph.ai |
| `sgraph_vault.remote.remote_s3` | S3 bucket | To build | push/pull via osbot-aws |
| `sgraph_vault.remote.remote_zip` | Zip export/import | To build | export/import vault archives |
| `sgraph_vault.pack.manifest` | Pack manifest | To build | read/write `_pack.json` |
| `sgraph_vault.cli.cli` | CLI entry point | To build | `sg-vault` command |

---

## First Session Task

**Task:** Set up the repo, build the core library, and get create/add/commit/encrypt round-trip working.

**Steps:**
1. Create repo skeleton (see `05_technical-bootstrap-guide.md`)
2. Create `.claude/CLAUDE.md` and `.claude/explorer/CLAUDE.md`
3. Create team structure (`team/explorer/{role}/`)
4. Implement `Vault`, `Blob`, `Tree`, `Commit` with Type_Safe
5. Implement AES-256-GCM encryption layer
6. Implement local folder remote backend
7. Implement basic CLI: `sg-vault init`, `sg-vault add`, `sg-vault commit`, `sg-vault status`
8. Full test suite for core operations
9. Create initial reality document

**Definition of done:**
- `sgraph_vault` package installable via `pip install -e .`
- Create vault → add files → commit → encrypt → export → import → decrypt → verify content
- Local remote: push to folder, clone from folder
- `sg-vault init`, `add`, `commit`, `status` working
- All tests passing with in-memory backend
- Reality document tracks what exists

---

## How to Read This Pack

| File | Purpose |
|------|---------|
| `BRIEF.md` | This file — start here after the first-session brief |
| `architecture.md` | Vault data model, object format, crypto, branch model, remote abstraction |
| `code-context.md` | Source code from App__Send and sg-send-cli to extract/reference |
| `addenda/appsec.md` | Security: zero-knowledge, key management, encrypt-for-reader |
| `addenda/architect.md` | Architecture decisions, dependency direction, migration path |
| `addenda/devops.md` | CI/CD, PyPI publishing, test infrastructure |
| `reference/briefs-index.md` | Index of all 20 vault source briefs with summaries |
