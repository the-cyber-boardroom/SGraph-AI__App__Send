# Dev Pack: SGraph-AI__Vault — Standalone Encrypted Vault Library

**Version:** v0.13.30
**Date:** 2026-03-12
**Objective:** Set up `SGraph-AI__Vault` repo, build core vault library, implement branch model, port CLI

---

## Reading Order

| # | File | Purpose |
|---|------|---------|
| 1 | [`07_first-session-brief.md`](07_first-session-brief.md) | **Start here** — orientation for a new Claude Code session |
| 2 | [`BRIEF.md`](BRIEF.md) | Full briefing: what to build, constraints, phases, specs, human decisions |
| 3 | [`architecture.md`](architecture.md) | Vault data model, object format, crypto, branch model, remote abstraction |
| 4 | [`03_role-definitions/`](03_role-definitions/) | 7 roles and their responsibilities |
| 5 | [`05_technical-bootstrap-guide.md`](05_technical-bootstrap-guide.md) | Step-by-step repo setup instructions |
| 6 | [`06_what-to-clone.md`](06_what-to-clone.md) | What to reference from the SG/Send main repo |
| 7 | [`code-context.md`](code-context.md) | Actual source code to extract and how to convert |
| 8 | [`08_first-session-prompt.md`](08_first-session-prompt.md) | Copy-paste prompt to bootstrap a new session |
| 9 | [`09_claude-md-review.md`](09_claude-md-review.md) | How to adapt CLAUDE.md for the vault project |
| 10 | [`addenda/appsec.md`](addenda/appsec.md) | Security: zero-knowledge model, key management, encrypt-for-reader |
| 11 | [`addenda/architect.md`](addenda/architect.md) | Architecture decisions, migration principles |
| 12 | [`addenda/devops.md`](addenda/devops.md) | CI/CD, PyPI publishing, test pipeline |
| 13 | [`reference/briefs-index.md`](reference/briefs-index.md) | Index of all 20 vault source briefs |

## Role Definitions

| Role | File |
|------|------|
| Architect | [`03_role-definitions/ROLE__architect.md`](03_role-definitions/ROLE__architect.md) |
| Dev | [`03_role-definitions/ROLE__dev.md`](03_role-definitions/ROLE__dev.md) |
| AppSec | [`03_role-definitions/ROLE__appsec.md`](03_role-definitions/ROLE__appsec.md) |
| DevOps | [`03_role-definitions/ROLE__devops.md`](03_role-definitions/ROLE__devops.md) |
| QA | [`03_role-definitions/ROLE__qa.md`](03_role-definitions/ROLE__qa.md) |
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
# The target repo:
git clone [repo-url] SGraph-AI__Vault
cd SGraph-AI__Vault

# Install dependencies
pip install -e ".[dev]"

# Run tests
pytest tests/

# CLI usage
sg-vault init --local /tmp/my-vault
sg-vault add README.md
sg-vault commit -m "Initial commit"
```

---

## Summary

This dev pack bootstraps a new Claude Code session to build `SGraph-AI__Vault` — a standalone encrypted vault library with Git-like version control. It synthesises 65 vault-related documents from the SG/Send project (v0.5.15 to v0.13.30, 22 Feb to 12 Mar 2026) covering:

- **Core library:** Content-addressed encrypted storage, tree structures, commits
- **Branch model:** PKI per branch, signed commits, merge-only main
- **Remotes:** SG/Send API, local folder, S3, zip, URL backends
- **CLI:** `sg-vault` with clone, push, pull, branch, merge, sign, export
- **Pack manifest:** Self-describing vaults with `_pack.json` UI configuration
- **Encrypt-for-reader:** Data encrypted for intended reader, not for storage

**Definition of done:** `sgraph-vault` on PyPI with create/add/commit/encrypt round-trip working, branch model with signed commits, at least two remote backends (local + SG/Send API), CLI with core commands, full test suite.
