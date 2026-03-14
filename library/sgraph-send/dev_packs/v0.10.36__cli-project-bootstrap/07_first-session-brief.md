# First Session Brief

**Version:** v0.10.36
**Date:** 3 March 2026
**Purpose:** Orientation for the first Claude Code session on the SG_Send__CLI repo

---

## Who You Are

You are the **Explorer team** for the SG_Send__CLI project. You have 6 roles: Architect, Dev, QA, DevOps, Librarian, Historian.

## What You're Building

A Python CLI tool (`sg-send-cli`) that syncs encrypted vaults between a local filesystem and SG/Send's Transfer API. Think of it as "git for encrypted vaults."

## What You Already Know

The architecture has already been designed. Read the assessment v2 in the main repo:
```
/tmp/sgraph-send-ref/team/roles/architect/reviews/03/03/v0.10.36__architect-dev-assessment-v2__vault-cli-local-sync.md
```

Key decisions are already made (see `03_role-definitions/ROLE__historian.md` for the full list).

## Your First Session Goals

**Pipeline first. Then crypto. Then everything else.**

### Session 1 Deliverables

1. **Repo skeleton** — directory structure, pyproject.toml, version file
2. **CLAUDE.md files** — main + explorer team (adapt from templates in `09_claude-md-review.md`)
3. **Team structure** — `team/explorer/{role}/` with README.md + ROLE files
4. **CI/CD pipeline** — GitHub Actions: test → tag → PyPI
5. **Custom Safe_* types** — all domain types with validation tests
6. **Schemas** — all pure data Type_Safe schemas with round-trip tests
7. **Vault__Crypto** — encrypt/decrypt/derive_key with interop test vectors
8. **Reality document** — what exists after this session

### Reading Order

1. This file (you're reading it)
2. `01_project-context.md` — what SG/Send is, how vaults work
3. `02_mission-brief.md` — your deliverables and rules
4. `04_practices-reference.md` — Type_Safe rules (critical)
5. `05_technical-bootstrap-guide.md` — step-by-step instructions
6. `06_what-to-clone.md` — what to read from the main repo

Then read the Type_Safe guides from the main repo:
7. `/tmp/sgraph-send-ref/library/dependencies/osbot-utils/type_safe/v3.63.4__for_llms__type_safe.md`
8. `/tmp/sgraph-send-ref/library/dependencies/osbot-utils/type_safe/v3.1.1__for_llms__type_safe__testing_guidance.md`

And the architecture:
9. `/tmp/sgraph-send-ref/team/roles/architect/reviews/03/03/v0.10.36__architect-dev-assessment-v2__vault-cli-local-sync.md`

## Critical Reminders

- **Zero raw primitives.** Not one `str`, `int`, or `dict` in a Type_Safe class.
- **Pipeline before features.** Get CI/CD working before writing vault logic.
- **Interop is the gate.** If Python crypto doesn't match browser crypto, everything stops.
- **Classes for everything.** No module-level functions, no static methods.
- **No Pydantic. No boto3. No mocks.**
