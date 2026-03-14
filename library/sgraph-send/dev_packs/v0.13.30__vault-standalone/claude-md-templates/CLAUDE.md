# SGraph Vault — Agent Guidance

**Read this before starting any task.** This file is the single source of truth for all agents working on SGraph Vault.

---

## MEMORY.md Policy

**Do NOT use MEMORY.md.** All persistent project knowledge is maintained by the Librarian in the repo itself. If you need to record something, add it to the appropriate location in `team/explorer/librarian/` or the reality document.

---

## Reality Document — MANDATORY CHECK

**Before describing, assessing, or assuming what SGraph Vault can do, READ:**

`team/explorer/librarian/reality/v0.1.0__what-exists-today.md`

### Rules (Non-Negotiable)

1. **If the reality document doesn't list it, it does not exist.**
2. **Proposed features must be labelled.** Write: "PROPOSED — does not exist yet."
3. **Briefs are aspirations, not facts.** Cross-check against the reality document.
4. **Update the reality document when you change code.**

---

## Project

**SGraph Vault** — standalone encrypted vault library with Git-like version control.

Vaults provide content-addressed encrypted storage with branches, signed commits, and multi-remote sync. The server never sees plaintext. All operations work offline.

**Version file:** `sgraph_vault/version`

---

## Stack

| Layer | Technology | Rule |
|-------|-----------|------|
| Runtime | Python 3.12 / arm64 | |
| Type system | `Type_Safe` from `osbot-utils` | **Never use Pydantic** |
| AWS operations | `osbot-aws` | **Never use boto3 directly** |
| Blob encryption | AES-256-GCM via `cryptography` | Web Crypto API compatible format |
| Commit signing | ECDSA P-256 via `cryptography` | Every commit signed by branch key |
| Testing | pytest, in-memory backends | **No mocks, no patches** |

---

## Architecture

- **Core library** — Vault, Blob, Tree, Commit, Branch objects using Type_Safe
- **Content-addressed storage** — Blob ID = SHA-256 of encrypted content
- **Branch model** — PKI per branch, signed commits, merge-only main
- **Pluggable remotes** — SG/Send API, local folder, S3, zip, URL
- **CLI** — `sg-vault` command with full vault operations
- **Offline-first** — All operations work without network

---

## Repo Structure

```
sgraph_vault/                   # Core library
  vault.py                      # Main Vault class
  objects/ (blob, tree, commit) # Content-addressed objects
  branch/ (branch, merge)       # Branch model + PKI
  crypto/ (encrypt, sign, keys) # AES-256-GCM + ECDSA
  remote/ (local, sgraph, s3)   # Pluggable backends
  pack/ (manifest, themes)      # Self-describing vaults
  cli/ (all commands)            # sg-vault CLI

tests/unit/                     # Tests (no mocks, in-memory)
tests/integration/              # Remote push/pull tests
tests/e2e/                      # Full round-trip tests

team/explorer/                  # Team roles and reviews
```

---

## Key Rules

### Code Patterns

1. **All schemas** use `Type_Safe`, never Pydantic
2. **All AWS calls** go through `osbot-aws`, never boto3
3. **All blob IDs** are SHA-256 hashes of encrypted content
4. **All commits** are signed by the branch private key
5. **All tests** use real implementations (in-memory), no mocks
6. **Version prefix** on all review/doc files

### Security

7. **Server never sees plaintext** — encryption is client-side
8. **AES-256-GCM format** matches Web Crypto API: `[IV 12 bytes][Ciphertext][Auth Tag 16 bytes]`
9. **Branch keys** never transmitted — stored locally, encrypted
10. **No key material in logs** — ever

### Human Folders — Read-Only for Agents

11. **`team/humans/dinis_cruz/briefs/` is HUMAN-ONLY.** Agents must NEVER create files there.
12. **Agent outputs** go to `team/humans/dinis_cruz/claude-code-web/MM/DD/`
13. **Role reviews** go to `team/explorer/{role}/reviews/MM/DD/`

### Git

14. **Default branch:** `dev`
15. **Branch naming:** `claude/{description}-{session-id}`
16. **Always push with:** `git push -u origin {branch-name}`

---

## Role System

7 roles: Architect, Dev, AppSec, DevOps, QA, Librarian, Historian.

Role definitions at `team/explorer/{role}/ROLE__{name}.md`.

Before starting work, check:
1. **Reality document** — what actually exists
2. Latest human brief in `team/humans/dinis_cruz/briefs/`
3. Your role's previous reviews in `team/explorer/{role}/reviews/`

---

## Relationship to SGraph-AI__App__Send

This repo is the extracted vault library. SG/Send imports it as a dependency. The vault API routes in App__Send will eventually delegate to this library. The browser encryption (vault-crypto.js) must produce ciphertext in the same format as this library's `encrypt_blob()`.

---

## Key Documents

| Document | Location |
|----------|----------|
| **Reality document** | `team/explorer/librarian/reality/` |
| **Dev pack** | In SG/Send: `library/sgraph-send/dev_packs/v0.13.30__vault-standalone/` |
| **Vault comprehensive debrief** | In SG/Send: `team/humans/dinis_cruz/debriefs/03/12/v0.13.30__debrief__vault-architecture-comprehensive.md` |
| **Branch model brief** | In SG/Send: `team/humans/dinis_cruz/briefs/03/12/v0.13.30__arch-brief__branch-model-multi-user.md` |
