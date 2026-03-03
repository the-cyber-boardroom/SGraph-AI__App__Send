# SG_Send__CLI — Agent Guidance

**Read this before starting any task.** This file is the single source of truth for all agents and roles working on SG_Send__CLI.

---

## MEMORY.md Policy

**Do NOT use MEMORY.md** (the auto-memory). All persistent project knowledge is maintained by the Librarian in the repo itself.

---

## Reality Document — MANDATORY CHECK

**Before describing, assessing, or assuming what SG_Send__CLI can do, READ the reality document** in `team/explorer/librarian/reality/`.

### Rules (Non-Negotiable)

1. **If the reality document doesn't list it, it does not exist.**
2. **Proposed features must be labelled** "PROPOSED — does not exist yet."
3. **Update the reality document when you change code** (same commit).

---

## Project

**SG_Send__CLI** — encrypted vault sync CLI (git-inspired) for [send.sgraph.ai](https://send.sgraph.ai).

Syncs encrypted files between a local filesystem and SG/Send's Transfer API. Files are encrypted locally (AES-256-GCM, `cryptography` library) before upload. The decryption key never leaves the user's machine.

**Version file:** `sg_send_cli/version`

---

## Stack

| Layer | Technology | Rule |
|-------|-----------|------|
| Runtime | Python 3.12 | |
| CLI framework | Typer (class-based `Typer__Routes`) | `cmd_` prefix convention |
| HTTP client | httpx | Async-capable, streaming |
| Encryption | `cryptography` (AESGCM + PBKDF2) | Must match browser exactly |
| Type system | `Type_Safe` from `osbot-utils` | **Never use Pydantic** |
| Testing | pytest, no mocks, no patches | Real implementations only |
| Build | Poetry | |
| CI/CD | GitHub Actions → PyPI (OIDC) | |

---

## Architecture

**Three-layer CLI:**

```
Layer 1: CLI Adapter (Typer__Routes)     — cmd_ methods, Typer-compatible types
Layer 2: Core Services (Type_Safe)       — Vault__Crypto, Vault__Client, Vault__Tree, etc.
Layer 3: Schemas + Types (Type_Safe)     — Pure data, zero raw primitives
```

**Local vault structure:**
```
.sg_vault/
├── config         # INI — vault_id, remote endpoint, auth
├── HEAD           # Vault key
├── index.json     # File tracking manifest
└── FETCH_HEAD     # Last known remote tree
```

---

## Repo Structure

```
sg_send_cli/                     # Package root
  cli/                           # Typer adapter (only Typer import)
  commands/                      # CLI command classes (Typer__Routes)
  core/                          # Pure logic services
  schemas/                       # Pure data Type_Safe schemas
  types/                         # Custom Safe_* domain types
  utils/                         # Utilities

tests/unit/sg_send_cli/          # Tests (no mocks, real implementations)

team/explorer/                   # Explorer team roles
  architect/                     # API contracts, encryption interop
  dev/                           # Implementation, reviews
  qa/                            # Test strategy, interop validation
  devops/                        # CI/CD, PyPI
  librarian/                     # Reality document, knowledge base
  historian/                     # Decision tracking

library/dependencies/            # Type_Safe guidance (copied from main repo)
```

---

## Key Rules

### Code Patterns

1. **All classes** extend `Type_Safe` — never plain Python classes
2. **Zero raw primitives** — no `str`, `int`, `float`, `list`, `dict` in Type_Safe classes
3. **Never use Pydantic** — ever
4. **Schemas are pure data** — no methods, no business logic
5. **Collection subclasses are pure type definitions** — no methods
6. **Use `@type_safe`** on methods that validate parameters
7. **Class-based CLI** — `Typer__Routes` with `cmd_` prefix, no module-level functions
8. **Return `None`** for not found — no exceptions for missing resources

### Encryption (Must Match Browser)

9. **AES-256-GCM** — 12-byte nonce, 16-byte tag, no AAD
10. **PBKDF2-HMAC-SHA256** — 600,000 iterations, salt = `sg-vault-v1:{vault_id}`
11. **Wire format** — `[12 bytes nonce][ciphertext + tag]`
12. **Interop test vectors** — must pass before any other work

### Testing

13. **No mocks, no patches** — real implementations
14. **`setUpClass` pattern** — shared test objects for speed
15. **Interop gate** — crypto tests must pass first

### Git

16. **Default branch:** `dev`
17. **Feature branches** from `dev`
18. **Branch naming:** `claude/{description}-{session-id}`
19. **Always push with:** `git push -u origin {branch-name}`

### Human Folders

20. **`team/humans/dinis_cruz/briefs/` is HUMAN-ONLY.** Agents NEVER create files there.
21. **Agent outputs** go to `team/humans/dinis_cruz/claude-code-web/`
22. **Debriefs** go to `team/humans/dinis_cruz/debriefs/`

---

## Team Structure

**Explorer team** (6 roles):

| Role | Scope |
|---|---|
| Architect | CLI architecture, encryption interop, API contracts |
| Dev | Implementation, code reviews |
| QA | Test strategy, interop validation, crypto vectors |
| DevOps | CI/CD, PyPI, repo infrastructure |
| Librarian | Reality document, knowledge base, master index |
| Historian | Decision tracking |

---

## Key Documents

| Document | Location |
|---|---|
| **Reality document** | `team/explorer/librarian/reality/` |
| Version file | `sg_send_cli/version` |
| Type_Safe guide | `library/dependencies/osbot-utils/type_safe/v3.63.4__for_llms__type_safe.md` |
| Architecture (main repo) | Assessment v2 in SG/Send main repo |

---

## Parent Project Reference

This CLI is an API client for **SG/Send** (`https://github.com/the-cyber-boardroom/SGraph-AI__App__Send`). The main repo contains:
- Transfer API routes and service (the API we call)
- Browser vault JavaScript (the implementation we must interop with)
- Type_Safe guidance (the coding standards we follow)
- CI/CD pipeline patterns (the deployment model we copy)

Clone to `/tmp/sgraph-send-ref` for read-only reference.
