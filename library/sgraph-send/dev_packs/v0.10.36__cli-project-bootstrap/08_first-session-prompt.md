# First Session Prompt

**Version:** v0.10.36
**Date:** 3 March 2026
**Purpose:** Copy-paste this into the first Claude Code session for the CLI project

---

## The Prompt

Copy everything below the line and paste it as your first message in a new Claude Code session:

---

```
You are bootstrapping a brand new project: **SG_Send__CLI** — an encrypted vault sync CLI (git-inspired).

This is a standalone project (separate repo) that provides a Python CLI for syncing encrypted vaults between a local filesystem and SG/Send's Transfer API. Commands: clone, push, pull, status, ls, info.

## Step 1: Read the bootstrap pack

The bootstrap pack lives in the SG/Send main repo. Clone it (read-only) and read the documents in order:


git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref


Read these files from the cloned repo, in this order:

1. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.10.36__cli-project-bootstrap/README.md` — index of all bootstrap documents
2. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.10.36__cli-project-bootstrap/07_first-session-brief.md` — your orientation
3. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.10.36__cli-project-bootstrap/01_project-context.md` — what SG/Send is, how vaults work
4. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.10.36__cli-project-bootstrap/02_mission-brief.md` — your mission and deliverables
5. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.10.36__cli-project-bootstrap/04_practices-reference.md` — Type_Safe rules (critical)
6. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.10.36__cli-project-bootstrap/05_technical-bootstrap-guide.md` — step-by-step setup
7. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.10.36__cli-project-bootstrap/06_what-to-clone.md` — what to copy from the main repo

Also read the role definitions:
8. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.10.36__cli-project-bootstrap/03_role-definitions/ROLE__architect.md`
9. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.10.36__cli-project-bootstrap/03_role-definitions/ROLE__dev.md`
10. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.10.36__cli-project-bootstrap/03_role-definitions/ROLE__qa.md`
11. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.10.36__cli-project-bootstrap/03_role-definitions/ROLE__devops.md`

And the architecture + guidance from the main repo:
12. `/tmp/sgraph-send-ref/team/roles/architect/reviews/26-03-03/v0.10.36__architect-dev-assessment-v2__vault-cli-local-sync.md` — full architecture
13. `/tmp/sgraph-send-ref/team/roles/dev/reviews/26-03-03/v0.10.36__implementation-brief__vault-key-stability.md` — vault key stability
14. `/tmp/sgraph-send-ref/library/dependencies/osbot-utils/type_safe/v3.63.4__for_llms__type_safe.md` — Type_Safe guide (MUST READ)
15. `/tmp/sgraph-send-ref/library/dependencies/osbot-utils/type_safe/v3.1.1__for_llms__type_safe__testing_guidance.md` — testing guide

And the CLAUDE.md templates:
16. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.10.36__cli-project-bootstrap/09_claude-md-review.md` — how to adapt CLAUDE.md

And the source code you need to interop with:
17. `/tmp/sgraph-send-ref/sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-send/sg-send-crypto.js` — browser encryption
18. `/tmp/sgraph-send-ref/sgraph_ai_app_send__ui__vault/v0/v0.1/v0.1.1/_common/js/lib/sg-vault/sg-vault.js` — browser vault logic

## Step 2: Create the repo

After reading all documents, your first task is:

1. Create the SG_Send__CLI repo structure as described in `05_technical-bootstrap-guide.md`
2. Create `.claude/CLAUDE.md` and `.claude/explorer/CLAUDE.md` for the new repo
3. Create `team/explorer/{role}/` directories with README.md + ROLE__{name}.md for each of the 6 roles
4. Set up the CI/CD pipeline (GitHub Actions → PyPI)
5. Define all custom Safe_* types with tests
6. Define all schemas (pure data Type_Safe) with round-trip tests
7. Implement Vault__Crypto with interop test vectors

You are operating as the **Explorer team** with 6 roles: Architect, Dev, QA, DevOps, Librarian, Historian. Pipeline first, crypto second, everything else after.

**Non-negotiable:** Zero raw primitives. Classes for everything. No Pydantic. No mocks.
```
