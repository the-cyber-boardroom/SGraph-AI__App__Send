# CLI Project Bootstrap Pack

**Version:** v0.10.36 | **Date:** 3 March 2026

Bootstrap pack for the **SG_Send__CLI** project — a standalone Python CLI tool that syncs encrypted vaults between a local filesystem and SG/Send's Transfer API. Git-inspired UX (clone, push, pull, status).

## Reading Order

| # | Document | Purpose |
|---|---|---|
| 1 | [`07_first-session-brief.md`](07_first-session-brief.md) | Start here — orientation for a new Claude Code session |
| 2 | [`01_project-context.md`](01_project-context.md) | What SG/Send is, how vaults work, what the CLI does |
| 3 | [`02_mission-brief.md`](02_mission-brief.md) | Mission, scope, deliverables, success criteria |
| 4 | [`03_role-definitions/`](03_role-definitions/) | 6 roles and their responsibilities |
| 5 | [`04_practices-reference.md`](04_practices-reference.md) | Type_Safe rules, testing patterns, git conventions |
| 6 | [`05_technical-bootstrap-guide.md`](05_technical-bootstrap-guide.md) | Step-by-step repo setup (pipeline first!) |
| 7 | [`06_what-to-clone.md`](06_what-to-clone.md) | What to reference from the SG/Send main repo |
| 8 | [`08_first-session-prompt.md`](08_first-session-prompt.md) | Copy-paste prompt to bootstrap a new Claude Code session |
| 9 | [`09_claude-md-review.md`](09_claude-md-review.md) | How to adapt CLAUDE.md for the CLI project |

## Role Definitions

| Role | File |
|---|---|
| Architect | [`03_role-definitions/ROLE__architect.md`](03_role-definitions/ROLE__architect.md) |
| Dev | [`03_role-definitions/ROLE__dev.md`](03_role-definitions/ROLE__dev.md) |
| QA | [`03_role-definitions/ROLE__qa.md`](03_role-definitions/ROLE__qa.md) |
| DevOps | [`03_role-definitions/ROLE__devops.md`](03_role-definitions/ROLE__devops.md) |
| Librarian | [`03_role-definitions/ROLE__librarian.md`](03_role-definitions/ROLE__librarian.md) |
| Historian | [`03_role-definitions/ROLE__historian.md`](03_role-definitions/ROLE__historian.md) |

## Reference Documents (in SG/Send main repo)

| Document | Path in main repo |
|---|---|
| Architect assessment v2 | `team/roles/architect/reviews/03/03/v0.10.36__architect-dev-assessment-v2__vault-cli-local-sync.md` |
| Vault key stability brief | `team/roles/dev/reviews/26-03-03/v0.10.36__implementation-brief__vault-key-stability.md` |
| Type_Safe guidance | `library/dependencies/osbot-utils/type_safe/v3.63.4__for_llms__type_safe.md` |
| Type_Safe testing | `library/dependencies/osbot-utils/type_safe/v3.1.1__for_llms__type_safe__testing_guidance.md` |
| Safe primitives reference | `library/dependencies/osbot-utils/type_safe/v3.28.0__for_llms__osbot-utils-safe-primitives.md` |
| Encryption source | `sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-send/sg-send-crypto.js` |
| Vault source | `sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-vault/sg-vault.js` |
| Transfer API routes | `sgraph_ai_app_send/lambda__user/fast_api/routes/Routes__Transfers.py` |
| Transfer service | `sgraph_ai_app_send/lambda__user/service/Transfer__Service.py` |
| CI/CD pipeline | `.github/workflows/ci-pipeline.yml` |
| Project CLAUDE.md | `.claude/CLAUDE.md` |
| Explorer CLAUDE.md | `.claude/explorer/CLAUDE.md` |

## Key Decision Already Made

- **Package:** `sg_send_cli` (PyPI name: `sg-send-cli`)
- **CLI framework:** Typer (class-based via `Typer__Routes` pattern)
- **Type system:** Type_Safe (zero raw primitives)
- **API:** Transfer API on User Lambda (public, zero-knowledge)
- **Encryption:** AES-256-GCM with PBKDF2, interop with browser vault
- **Pipeline first:** CI/CD + PyPI before any vault logic
