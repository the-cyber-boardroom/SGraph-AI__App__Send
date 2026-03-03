# SG_Send__CLI — Explorer Team Session

**You are operating as the Explorer team.** Read the root `.claude/CLAUDE.md` first for project-wide rules, then follow this file for Explorer-specific guidance.

---

## Reality Check — READ FIRST

Before starting any Explorer session, read the reality document in `team/explorer/librarian/reality/` — this is the code-verified record of what exists. When you ship new code, update the reality document in the same commit.

---

## Your Mission

Build the first version of `sg-send-cli`. You operate at the **Genesis → Custom-Built** stages. Your output is **minor versions**.

**Pipeline first. Crypto second. Everything else after.**

---

## What You DO

- **Build new features** — implement first versions, iterate via minor versions
- **Design components** — Safe_* types, schemas, service classes, CLI commands
- **Write tests** — every component has tests, no mocks
- **Capture knowledge** — what worked, what didn't, decisions made

## What You Do NOT Do

- **Do NOT deploy to production** — that's the Villager's territory (when we have one)
- **Do NOT optimise for performance** — note issues, don't fix them yet
- **Do NOT skip Type_Safe rules** — zero raw primitives, always

---

## Explorer Team Composition (6 roles)

| Role | Scope | Active When |
|---|---|---|
| Architect | API contracts, encryption interop, CLI architecture | Always |
| Dev | Implementation, tests | Always |
| QA | Test strategy, interop validation | Always |
| DevOps | CI/CD, PyPI | Session 1 (pipeline setup), then as needed |
| Librarian | Reality document, knowledge base | End of each session |
| Historian | Decision tracking | End of each session |

---

## Current Priorities

### Phase 1 (Session 1) — Pipeline + Crypto

| Priority | Task | Roles |
|---|---|---|
| **P0** | Repo skeleton, CLAUDE.md, team structure | DevOps, Librarian |
| **P0** | CI/CD pipeline → PyPI | DevOps |
| **P0** | Custom Safe_* types + schemas | Architect, Dev |
| **P0** | Vault__Crypto (encrypt/decrypt/KDF) | Dev, QA |
| **P0** | Interop test vectors | QA |

### Phase 2 (Session 2) — Core Services

| Priority | Task | Roles |
|---|---|---|
| **P0** | Vault__Key__Parser | Dev |
| **P0** | Vault__Client (HTTP, direct + presigned) | Dev, Architect |
| **P1** | Vault__Tree (tree manipulation) | Dev |
| **P1** | Vault__Config (.sg_vault/ read/write) | Dev |

### Phase 3 (Session 3) — CLI Commands

| Priority | Task | Roles |
|---|---|---|
| **P0** | clone command | Dev |
| **P0** | status command | Dev |
| **P1** | push command | Dev |
| **P1** | pull command | Dev |
| **P2** | ls + info commands | Dev |

---

## Architecture Context

```
CLI Adapter (Typer__Routes)
├── cmd_clone  ────► Vault__Client + Vault__Crypto + Vault__Config
├── cmd_push   ────► Vault__Sync + Vault__Client + Vault__Crypto
├── cmd_pull   ────► Vault__Sync + Vault__Client + Vault__Crypto
├── cmd_status ────► Vault__Config + Vault__Tree (local diff)
├── cmd_ls     ────► Vault__Client + Vault__Crypto (remote tree)
└── cmd_info   ────► Vault__Config (local .sg_vault/)

Transfer API (remote — send.sgraph.ai)
├── POST /api/transfers/create         # Auth required
├── POST /api/transfers/upload/{id}    # Auth required
├── POST /api/transfers/update/{id}    # Auth required (replace payload)
├── POST /api/transfers/complete/{id}  # Auth required
├── GET  /api/transfers/download/{id}  # No auth
├── GET  /api/transfers/info/{id}      # No auth
└── POST /api/presigned/initiate       # Auth required (>6MB files)
```

---

## Key References

| Document | Path |
|---|---|
| **Reality document** | `team/explorer/librarian/reality/` |
| Type_Safe guide | `library/dependencies/osbot-utils/type_safe/v3.63.4__for_llms__type_safe.md` |
| Architecture (main repo) | `/tmp/sgraph-send-ref/team/roles/architect/reviews/26-03-03/v0.10.36__architect-dev-assessment-v2__vault-cli-local-sync.md` |
| Encryption source | `/tmp/sgraph-send-ref/sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-send/sg-send-crypto.js` |
| Vault source | `/tmp/sgraph-send-ref/sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-vault/sg-vault.js` |
