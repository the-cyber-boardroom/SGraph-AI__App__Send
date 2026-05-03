# Reality — Master Index

**Version:** v0.27.2 | **Last updated:** 2026-05-03 | **Maintained by:** Librarian (daily run)
**Structure:** Domain tree — each domain has its own directory with `index.md` and `proposed/`

This file is the entry point. Read it to find the right domain, then go to that domain's
`index.md` for EXISTS details and `proposed/index.md` for PROPOSED items.

**Rule:** If a feature is not listed in a domain index, it does not exist. Proposed features
are labelled PROPOSED. Claimed features that are not in any index DO NOT EXIST.

---

## Domain Map

| Domain | Directory | What It Covers | EXISTS items |
|--------|-----------|----------------|-------------|
| **User API** | [`send-api/`](send-api/index.md) | User Lambda: send.sgraph.ai HTTP endpoints | 26 endpoints (all tested) |
| **Admin API** | [`admin-api/`](admin-api/index.md) | Admin Lambda: auth-protected endpoints | 51 endpoints (all tested) |
| **Vault** | [`vault/`](vault/index.md) | Vault/SGit crypto + storage layer | Key derivation, object CAS, AES-256-GCM |
| **CLI** | [`cli/`](cli/index.md) | sgit CLI (PyPI: sgit-ai) | 20+ commands, verified integrations |
| **Website** | [`website/`](website/index.md) | sgraph.ai website (21 pages, web components) | 21 pages, 11 components, CI pipeline |
| **Browser UIs** | [`ui/`](ui/index.md) | Three browser UIs (user, admin, workspace) | 3 UIs, ~30 web components |
| **Tools** | [`tools/`](tools/index.md) | tools.sgraph.ai browser tools | 4 tools live |
| **Infrastructure** | [`infra/`](infra/index.md) | Deployment, CI/CD, Lambda, Docker | 7 targets, 2 Lambda functions |
| **Security** | [`security/`](security/index.md) | Security properties, violations, AppSec | 11 verified properties |
| **Identity** | [`identity/`](identity/index.md) | Credentials, OAuth, billing | Token auth only (rest PROPOSED) |
| **AI Agents** | [`ai-agents/`](ai-agents/index.md) | Agentic workflows, LLM components, MCP | MCP + Claude vault access verified |
| **QA** | [`qa/`](qa/index.md) | Tests that pass, QA infrastructure | ~602 tests, all passing |
| **Alchemist** | [`alchemist/`](alchemist/index.md) | Investor materials, Alchemist system | 3 documents |

---

## Quick Stats (as of 2026-05-03)

| Metric | Count |
|--------|-------|
| User Lambda API endpoints | 26 unique (34 route paths) |
| Admin Lambda API endpoints | 51 unique (61 route paths) |
| Total API endpoints | **73** |
| Unit tests passing | **~602** |
| Deployment targets | **7** (Lambda, Docker, Fargate, GCP, EC2, AMI, CLI) |
| Website pages | 21 |
| Browser UIs | 3 (user, admin, workspace) |
| Active tools (tools.sgraph.ai) | 4 |
| sgit CLI commands | 20+ |
| Open PROPOSED items (across all domains) | 115+ |
| Total documents catalogued | 336 (master indexes 04/25–05/03) |

---

## Cross-Domain Notes

**Vault spans multiple domains** — a common source of confusion:
- `/vault/*` endpoints on User Lambda → `send-api/`
- `/vault/*` endpoints on Admin Lambda (legacy model) → `admin-api/`
- Vault encryption/crypto design → `vault/`
- sg-vault.js browser client → `vault/` (browser-js sub-file, future)
- sgit CLI vault operations → `cli/`

**MCP exists on both Lambdas:**
- User Lambda MCP: transfers, presigned, vault → `send-api/`
- Admin Lambda MCP: tokens, keys, vault, users → `admin-api/`

**⚠️ Active four-team change:** Structure key encryption split — see `vault/proposed/structure-key-split.md`

---

## Changelog

See [`changelog.md`](changelog.md) for a pointer log of recent changes to this domain tree.

---

## Archived Monolith

The pre-split reality document is preserved at:
`v0.16.26__what-exists-today.md` (237KB, 2,975 lines)

When backlog tasks B-001 through B-005 are complete (see `team/roles/librarian/DAILY_RUN.md`),
all content from the monolith will be migrated into domain files and the monolith will serve
only as a historical archive.
