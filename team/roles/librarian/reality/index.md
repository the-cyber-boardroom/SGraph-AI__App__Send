# Reality — Master Index

**Version:** v0.33.53 | **Last updated:** 2026-08-06 | **Maintained by:** Librarian (daily run)
**Structure:** Domain tree — each domain has its own directory with `index.md` and `proposed/`

This file is the entry point. Read it to find the right domain, then go to that domain's
`index.md` for EXISTS details and `proposed/index.md` for PROPOSED items.

**Rule:** If a feature is not listed in a domain index, it does not exist. Proposed features
are labelled PROPOSED. Claimed features that are not in any index DO NOT EXIST.

---

## Domain Map

| Domain | Directory | What It Covers | EXISTS items |
|--------|-----------|----------------|-------------|
| **User API** | [`send-api/`](send-api/index.md) | User Lambda: send.sgraph.ai HTTP endpoints | 32 endpoints (all tested) |
| **Admin API** | [`admin-api/`](admin-api/index.md) | Admin Lambda: auth-protected endpoints | 51 endpoints (all tested) |
| **Vault** | [`vault/`](vault/index.md) | Vault/SGit crypto + storage layer | Key derivation, object CAS, AES-256-GCM |
| **CLI** | [`cli/`](cli/index.md) | sgit CLI (PyPI: sgit-ai) | 20+ commands, verified integrations |
| **Website** | [`website/`](website/index.md) | sgraph.ai website (21 pages, web components) | 21 pages, 11 components, CI pipeline |
| **Browser UIs** | [`ui/`](ui/index.md) | Share (v0.4), Open (v0.4), Admin, Workspace, Vault; v0.3.x user legacy | 5 active + 1 legacy; ~35 web components |
| **Tools** | [`tools/`](tools/index.md) | tools.sgraph.ai browser tools | 4 tools live |
| **Infrastructure** | [`infra/`](infra/index.md) | Deployment, CI/CD, Lambda, Docker | 7 targets, 2 Lambda functions |
| **Security** | [`security/`](security/index.md) | Security properties, violations, AppSec | 11 verified properties |
| **Identity** | [`identity/`](identity/index.md) | Credentials, OAuth, billing | Token auth only (rest PROPOSED) |
| **AI Agents** | [`ai-agents/`](ai-agents/index.md) | Agentic workflows, LLM components, MCP | MCP + Claude vault access verified |
| **QA** | [`qa/`](qa/index.md) | Tests that pass, QA infrastructure | ~2015+ tests, all passing |
| **Alchemist** | [`alchemist/`](alchemist/index.md) | Investor materials, Alchemist system | 3 documents |

---

## Quick Stats (as of 2026-08-04)

| Metric | Count |
|--------|-------|
| User Lambda API endpoints | 32 unique (40 route paths) + `/api/info/sgraph` (Routes__Info__SGraph.py) |
| Admin Lambda API endpoints | 51 unique (61 route paths) |
| Total API endpoints | **83+** |
| Unit tests passing | **~2950+** (977 Python + ~157 vault-UI JS + ~930+ ViV loader suite (373+ base + ~557 from LLM/voice/releases/send-browse-split/image/sync sessions 08/02–08/04: sg_releases 47, pinned_data_source 27, vault_releases_editor 44, sg_llm_config 53, sg_llm 40, sg_llm_vault 17, sg_voice 86, base64_chunk_guard 88, send_browse_split 97, vault_llm_log 35, vault_llm_chat 122, vault_shell_llm_panels 28, app_page_llm_panels 46, vault_llm_requests 29, vault_browse_edit__add_to_chat 13, app_shell_llm_bridge 96, sg_vision 62, no_auto_reload 27) + ~78 app-shell JS + 37 embed-protocol + ~334 inbox/write-batch/owner-secrets suite; browser integration: 8 tests; +10 app-shell-nav-helpers) |
| Deployment targets | **7** (Lambda, Docker, Fargate, GCP, EC2, AMI, CLI) |
| Website pages | 21 |
| Browser UIs | **7** (share v0.4, open v0.4, admin, workspace, vault browser, vault app /en-gb/app; user v0.3.x legacy) |
| Active tools (tools.sgraph.ai) | 4 |
| sgit CLI commands | 20+ |
| Open PROPOSED items (across all domains) | ~1040+ (+13 net-new from 31 July: P-ACT-001–013 in alchemist/; previously ~1027+; processed 2026-08-03) |
| Total documents catalogued | 910 (+26 from 31 July: 25 substantive briefs + 1 day-index; processed 08/03) |
| **Key decision** | **Risk Mandate.ai** adopted as product name (resolves OQ-company-name-1, 2026-06-25) |
| **Key decision** | **Grounded alarm** adopted as the Risk Mandate communication strategy term (replaces FUD framing, 2026-07-05) |
| **Key decision** | **The grant is the mandate** — authorization is the union of what the agent can already do; "never-in-line" (2026-07-23) |
| **Key decision** | **"We describe, we do not decide"** — posture held against investor pressure for runtime authority (2026-07-23) |
| **Key decision** | **Market = decision-making** at every altitude of every organisation (not agent governance, not runtime authority) (2026-07-23) |
| **Key decision** | **The message is the transformation** — inter-register communication via JSON transformation commands, not shared state (2026-07-17) |
| **Key decision** | **"We sell the mandate to operate"** — product reframe from dashboard/register to mandate delivered vault-to-vault (2026-07-17) |
| **Latest build spec** | Airgapped RiskMandate demo/MVP (read-only vault + local storage + persona library + risk flow upward + actionable items) — 17 July 2026 |
| **Next build priority** | Browser-local query engine (vault-as-source-of-truth, sync by commit-id, IndexedDB) — blocks the airgapped MVP |
| **Key decision** | **Voice note transcription tool** — first SGraph product going to market; 90-day partnership term from 1 Aug 2026; OpenRouter carries both inference and billing; three privacy modes (routed/restricted/browser-local); all PROPOSED (2026-07-27) |
| **Key decision** | **Accepted ≠ Acceptable** — two orthogonal primitives: Accepted = a named individual's act at a specific altitude and time; Acceptable = a business-owned threshold set by policy; Article 9 EU AI Act mandates risk management without defining acceptable (2026-07-28) |
| **Key decision** | **Three-predicate model** — Confirmed (technical fact), Validated (compliance interpretation by GRC), Accepted (appetite judgement by business owner at altitude); the chain from a technical fact to a board decision (2026-07-28) |
| **Key decision** | **Regulation graph = vault + website** — EU AI Act encoded via AKN4EU XML, graph starts empty and accretes as customer answers Confirm/Validate/Accept provisions; partial connection sufficient for value (2026-07-28) |
| **Key decision** | **Air gap drawn as bespoke manual integration** — a gap has no evolution; the labour that fills it sits at genesis; map shape = evolved ends + manual middle; three Wardley maps: air-gap (sales), translation (altitudes), evidence chain (agent→board) (2026-07-28) |
| **Black Hat USA** | **Business Hall opened 2026-08-04.** Voice shipped 2026-08-03. Screenshot paste + auto-sync data-loss fix + claude-sonnet-5 default shipped 2026-08-04. Vision capability detection live from OpenRouter catalogue. iPad run not yet verified (unit-tested). |
| **Key decision** | **Vault authors, repo publishes** — clear text in a public repository is the enabling condition for verification as differentiator; vault stays authoring environment; publishing to encrypted vault abandoned in favour of public repo; split-by-path resolves two-store conflict (2026-07-31) |
| **Key decision** | **Consolidation = customisation** — EU AI Act consolidation and per-customer organisational customisation are the same graph operation; one engine serves both (2026-07-31) |
| **Key decision** | **Amendment is the subscription** — Standards-as-a-Service: open artefact, recurring revenue from re-derivation as instrument amends; cost scales with change not size (2026-07-31) |
| **Key decision** | **Accountability manufactures demand for evidence** — three primitives (risk-as-fact, named person, visible upward) produce self-correction; three failure conditions: guessable reviewer, prior commitment, undiscriminated information (2026-07-31) |
| **Key legal fact** | **EU AI Act transparency obligations (Article 50) are now live** — in force from 2 August 2026; Annex III standalone high-risk obligations deferred to 2 December 2027; Regulation 2026/1744 in force 27 July 2026 |

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
