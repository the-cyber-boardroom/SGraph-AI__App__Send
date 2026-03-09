# Debrief: Library Inventory — What's in `library/`

**Version:** v0.13.6
**Date:** 9 March 2026
**Role:** Librarian
**Purpose:** Complete audit of the `library/` directory — what exists, what's current, what's stale

---

## Executive Summary

The `library/` directory contains **258 markdown files, 6 Python test files, and 11 Issues FS files** across 6 top-level sections. It serves as the project's reference knowledge base — dependency guides, specifications, development methodology, roadmap, dev packs for spawning new repos, research documents, incident records, and investor materials.

**Key finding:** The library has grown organically from v0.1.1 to v0.12.2 and is broadly useful, but some sections are significantly out of date relative to the project's current state at v0.13.6. The roadmap and specs index still reflect the original phase plan, while the project has already shipped features from phases 3, 5, 7, 9, 10, and 11 (billing/Stripe, i18n, MCP, CLI, data rooms, desktop/mobile apps).

---

## Section-by-Section Inventory

### 1. `library/alchemist/` — Investor & Business Materials

**Files:** 12 markdown + 3 `.gitkeep` placeholders
**Version:** All at v0.5.8 (21 Feb 2026)
**Status:** Current but from a single batch. No updates since creation.

| Document | Purpose |
|---|---|
| [Business Plan](../../../../../../library/alchemist/materials/v0.5.8__business-plan__sg-send.md) | Full business plan for SG/Send |
| [Competitive Analysis](../../../../../../library/alchemist/materials/v0.5.8__competitive-analysis__sg-send.md) | Market comparison (WeTransfer, OnionShare, etc.) |
| [Founder Profile](../../../../../../library/alchemist/materials/v0.5.8__founder-profile__dinis-cruz.md) | Dinis Cruz background for investors |
| [Investment Strategy](../../../../../../library/alchemist/materials/v0.5.8__investment-strategy__sg-send.md) | Funding approach and investor targeting |
| [Investor Briefing Pack (PKI)](../../../../../../library/alchemist/materials/v0.5.8__investor-briefing-pack__pki-milestone.md) | PKI milestone briefing for investors |
| [Investor Categories](../../../../../../library/alchemist/materials/v0.5.8__investor-categories__sg-send.md) | Investor segmentation and targeting |
| [Marketing Strategy](../../../../../../library/alchemist/materials/v0.5.8__marketing-strategy__sg-send.md) | Go-to-market strategy |
| [Materials Inventory](../../../../../../library/alchemist/materials/v0.5.8__materials-inventory__initial-audit.md) | Audit of what materials exist |
| [Elevator Pitch Deck](../../../../../../library/alchemist/materials/v0.5.8__pitch-deck__elevator.md) | Short-form pitch |
| [Narrative Pitch Deck](../../../../../../library/alchemist/materials/v0.5.8__pitch-deck__narrative-driven.md) | Story-driven pitch |
| [Revenue Model](../../../../../../library/alchemist/materials/v0.5.8__revenue-model__sg-send.md) | Financial strategy and revenue streams |
| [Runs-Everywhere Strategy](../../../../../../library/alchemist/materials/v0.5.8__runs-everywhere__sg-send.md) | Multi-platform deployment narrative |

**Scaffolded but empty:** `due-diligence/business/`, `due-diligence/legal/`, `due-diligence/technical/`, `investors/`, `narratives/`

**Staleness note:** These materials predate the desktop app, mobile apps, Stripe integration, and the 40+ customers milestone. The competitive analysis doesn't mention the WeTransfer AI terms controversy (a major positioning opportunity noted in the Mar 8 daily brief). Consider updating for the next investor conversation.

---

### 2. `library/dependencies/` — Dependency Guides for LLMs

**Files:** 24 documents across 6 dependency libraries
**Status:** Mixed — some current, some from early versions

| Dependency | Files | Versions | Purpose |
|---|---|---|---|
| **cache-service** | 2 | v0.5.68, v0.6.0 | Cache service client usage guide |
| **issues-fs** | 4 | v0.2.32 – v0.6.1 | Issues FS architecture, user guide, agent workflow |
| **memory-fs** | 2 | v0.36.2, v0.41.0 | Memory-FS abstraction layer architecture |
| **osbot-aws** | 3 | v2.29.9 | AWS operations: core, Lambda, S3 |
| **osbot-fast-api** | 2 | v0.24.2, v0.34.0 | Routes development guide, service client architecture |
| **osbot-utils** | 13 | v3.1.1 – v3.69.2 | Type_Safe guides (7), features (4), performance benchmarks (6 including .py) |

**Most important for new agents:**
- `osbot-utils/type_safe/v3.63.4__for_llms__type_safe.md` — the core Type_Safe reference
- `memory-fs/v0.36.2__memory-fs__architecture-and-how-to-use-It.md` — storage abstraction
- `osbot-fast-api/v0.24.2__osbot-fast-api__routes_development_guide.md` — route patterns

**Staleness note:** The osbot-utils guides are well-maintained (multiple versions). The osbot-aws guides are all at v2.29.9 and may need updating if the library has moved on. The cache-service and memory-fs guides are from earlier project phases.

---

### 3. `library/docs/` — Specifications & Catalogue

**Files:** 10 documents
**Status:** Foundational but partially stale

**Specs index** ([README.md](../../../../../../library/docs/specs/README.md)): Maps 6 original specification documents to project phases. These are the founding documents that defined SG/Send's scope.

| Doc # | Document | Covers |
|---|---|---|
| 1 | Project Brief | MVP user stories, API, encryption, S3, deployment |
| 2 | Roadmap | Deploy-everywhere, cost tracking, billing, security intel |
| 3 | Plugins, i18n & Commercial | Plugin architecture, themes, internationalisation |
| 4 | LLM, Retention, Compliance & GTM | LLM integration, retention, user accounts, go-to-market |
| 5 | Strategic Opportunities | CLI, MCP, secrets, browser extension, data rooms, P2P |
| 6 | Naming & Branding | Brand architecture, URLs, product portfolio |

**Original docs** in `_to_process/`: 6 spec documents + 3 v0.1.1 bootstrap briefs (Claude Code, OpenAI Codex, dev environment).

**Catalogue**: 1 reading guide (`v0.2.16__reading-guide__team-expansion-and-workstreams.md`) — comprehensive team expansion document from 12 Feb when the team grew from 13 to 17 roles.

**Staleness note:** The specs index says "Max file size: Architect to recommend (50-100MB for MVP)" — the project now supports 1GB with 5GB planned. The phase roadmap lists MCP as "Phase 10" and CLI as "Phase 9" — both are already shipped. The original specs are still useful as historical context but no longer reflect current scope.

---

### 4. `library/guides/` — Development Methodology

**Files:** 12 documents
**Status:** Current and actively referenced

| Guide | Path | Purpose |
|---|---|---|
| **IFD Intro** | [v1.2.1__ifd__intro-and-how-to-use.md](../../../../../../library/guides/development/ifd/v1.2.1__ifd__intro-and-how-to-use.md) | Core IFD methodology — flow state, UX-first, real data, zero dependencies |
| **IFD Versioning** | [v1.2.0__ifd__versioning_guide.md](../../../../../../library/guides/development/ifd/v1.2.0__ifd__versioning_guide.md) | Versioning patterns for IFD |
| **IFD Testing** | [v1.2.0__ifd__testing_guide.md](../../../../../../library/guides/development/ifd/v1.2.0__ifd__testing_guide.md) | Testing strategy for IFD |
| **IFD (older)** | [v1.1.0__idf__iterative_flow_development.md](../../../../../../library/guides/development/ifd/v1.1.0__idf__iterative_flow_development.md) | Earlier IFD version |
| **IFD Issues-FS** | `ifd__issues-fs/` (6 files) | IFD applied to Issues FS: Web Components, services, events, debug panel, implementation reference |
| **Python Formatting** | [v3.63.4__for_llms__python_formatting_guide.md](../../../../../../library/guides/development/code-formating/v3.63.4__for_llms__python_formatting_guide.md) | Code formatting standards |
| **Type_Safe Testing** | [v3.1.1__for_llms__type_safe__testing_guidance.md](../../../../../../library/guides/development/testing/v3.1.1__for_llms__type_safe__testing_guidance.md) | Testing with Type_Safe |
| **Cache Service Testing** | [v1.1.4___v0.16.1__cache_service__testing_guidance.md](../../../../../../library/guides/patterns/v1.1.4___v0.16.1__cache_service__testing_guidance.md) | Testing patterns for cache service |
| **Agentic Workflow** | [v0.1.0__guide__agentic-role-based-workflow.md](../../../../../../library/guides/agentic-setup/v0.1.0__guide__agentic-role-based-workflow.md) | Role-based agentic workflow |
| **Agentic Practice** | [v0.2.24__guide__sgraph-send-agentic-workflow-in-practice.md](../../../../../../library/guides/agentic-setup/v0.2.24__guide__sgraph-send-agentic-workflow-in-practice.md) | Agentic workflow applied to SG/Send |

**This is the healthiest section.** The IFD guides are actively used by every Claude Code session and referenced in CLAUDE.md. The agentic workflow guides document the team's operating model.

---

### 5. `library/roadmap/` — Phase Planning

**Files:** 2 documents
**Status:** Stale — reflects original planning, not current reality

| Document | Content |
|---|---|
| [Phase Overview](../../../../../../library/roadmap/phases/v0.1.1__phase-overview.md) | 11+ phases from MVP to enterprise features |
| [Phase 1 Issues](../../../../../../library/roadmap/phases/v0.1.1__phase-1-issue-overview.md) | Phase 1 MVP issue breakdown |

**Staleness note:** Both are at v0.1.1 (8 Feb 2026 — over a month old). The project has shipped well beyond Phase 1 MVP. Features listed as Phase 3 (billing), Phase 5 (i18n), Phase 9 (CLI), Phase 10 (MCP), and Phase 11+ (data rooms, browser extension, mobile) are all live or in progress. This section needs a major update or an explicit "historical — see reality document" marker.

---

### 6. `library/sgraph-send/` — Project-Specific Knowledge

**Files:** ~200 documents across 4 subsections
**Status:** The largest and most diverse section

#### 6a. Dev Packs (8 packs, ~160 files)

Dev packs are self-contained bootstrap kits for spawning new repos/projects. Each contains a README, BRIEF, role definitions, CLAUDE.md templates, team templates, and reference docs.

| Dev Pack | Version | Date | Target |
|---|---|---|---|
| [CloudFront Log Pipeline](../../../../../../library/sgraph-send/dev_packs/v0.4.5__cloudfront-log-pipeline/BRIEF.md) | v0.4.5 | 16 Feb | `SG_Send__Deploy` — CloudFront log analysis |
| [PKI Key Discovery](../../../../../../library/sgraph-send/dev_packs/v0.5.0__pki-key-discovery/BRIEF.md) | v0.5.0 | 21 Feb | PKI key registry and discovery |
| [QA Project Bootstrap](../../../../../../library/sgraph-send/dev_packs/v0.5.29__qa-project-bootstrap/README.md) | v0.5.29 | 22 Feb | QA automation (Playwright/Selenium) |
| [Ephemeral EC2 Data Rooms](../../../../../../library/sgraph-send/dev_packs/v0.5.33__deploy-ephemeral-ec2-data-rooms/README.md) | v0.5.33 | 23 Feb | `SG_Send__Deploy` — EC2 data room deployment |
| [CLI Project Bootstrap](../../../../../../library/sgraph-send/dev_packs/v0.10.36__cli-project-bootstrap/README.md) | v0.10.36 | 3 Mar | `SG_Send__CLI` — vault sync CLI |
| [Chrome Extension Key Vault](../../../../../../library/sgraph-send/dev_packs/v0.11.12__chrome-extension-key-vault/README.md) | v0.11.12 | 5 Mar | `sgraph_ai__chrome_extension` — encrypted key management |
| [tools.sgraph.ai](../../../../../../library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/README.md) | v0.11.12 | 5 Mar | `sgraph_ai__tools` — canonical component library |
| [Desktop App](../../../../../../library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/README.md) | v0.12.2 | 8 Mar | `SGraph-AI__Desktop` — Tauri desktop app |

**These are high-quality, well-structured documents.** Each follows a consistent format with reading order, role definitions, reference links, and CLAUDE.md templates. The most recent (v0.12.2, desktop) is just 1 day old.

#### 6b. File Transfer Engine Research (14 files)

Comprehensive architecture research from v0.3.12–v0.3.13 (mid-Feb):

| Category | Documents |
|---|---|
| **Architecture** (4) | Adapter interfaces, comparison matrix, recommendations, transfer manifest schema |
| **Research** (10) | S3 multipart/presigned, Tus/Uppy/Resumable.js, browser storage APIs, S3 constraints/costs, compression algorithms, chunked encryption, cloud providers comparison, WebRTC P2P, Lambda streaming, content-addressable storage |

**Status:** Foundational research that informed the current upload architecture (direct upload < 6MB, presigned S3 multipart > 6MB). Still valid reference material.

#### 6c. Incidents (4 incidents)

| Incident | Date | Summary |
|---|---|---|
| [INC-001](../../../../../../library/sgraph-send/incidents/INC-001__2026-02-12__commit-author-impersonation) | 12 Feb | Commit author impersonation |
| [INC-002](../../../../../../library/sgraph-send/incidents/INC-002__2026-02-17__first-external-security-disclosure) | 17 Feb | First external security disclosure (comprehensive — 10+ sub-folders with Issues FS tracking) |
| [INC-003](../../../../../../library/sgraph-send/incidents/INC-003__2026-02-19__access-token-leak-in-urls) | 19 Feb | Access token leak in shareable URLs |
| [INC-004](../../../../../../library/sgraph-send/incidents/INC-004__2026-02-19__documentation-token-leak) | 19 Feb | Documentation token leak (data breach) |

**Status:** Well-documented security history. INC-002 is particularly thorough — it's a full incident pack with sub-issues broken down by priority (P3 through P8) and functional area.

#### 6d. Releases (1 release pack)

| Release | Date | Files |
|---|---|---|
| [v0.3.5 Release Pack](../../../../../../library/sgraph-send/releases/v0.3.5/README.md) | 15 Feb | 14 files — release overview + per-role documents (Advocate, AppSec, Architect, Cartographer, Conductor, Designer, Dev, DevOps, Historian, Journalist, Librarian, QA, Sherpa) |

**Status:** Self-contained snapshot of the v0.3.5 MVP release. Well-structured with cross-references between role documents. No subsequent release packs have been created despite the project moving through v0.4–v0.13.

---

## Staleness Assessment

| Section | Version | Current? | Action Needed |
|---|---|---|---|
| Alchemist materials | v0.5.8 | Partially stale | Update competitive analysis (WeTransfer AI), add desktop/mobile narrative |
| Dependencies | v2.29.9–v3.69.2 | Mostly current | Check osbot-aws version; osbot-utils is well-maintained |
| Docs/specs | v0.1.1–v0.2.16 | Stale | Specs index needs "many features now shipped" note; catalogue is from Feb 12 |
| Guides | v1.1.0–v3.63.4 | Current | IFD and agentic guides are actively used |
| Roadmap | v0.1.1 | Stale | Phase plan doesn't reflect that Phases 3,5,9,10,11+ are shipped |
| Dev packs | v0.4.5–v0.12.2 | Current | Most recent pack is 1 day old; older packs still useful as templates |
| File transfer research | v0.3.12–v0.3.13 | Current | Foundational research, still valid |
| Incidents | Feb 2026 | Current | Good historical record |
| Releases | v0.3.5 | Stale | No release packs since v0.3.5; project is now at v0.13.6 |

---

## Recommendations

1. **Add a "historical" banner to `library/roadmap/`** — point readers to the reality document instead
2. **Create a v0.13.6 release pack** in `library/sgraph-send/releases/` — the project has shipped desktop, mobile, Stripe, i18n, MCP, vaults, data rooms, and 73 endpoints since the v0.3.5 pack
3. **Update the alchemist materials** — desktop/mobile apps, 40+ customers, WeTransfer controversy, and the architecture explainer (v0.15.5) are all strong investor talking points not reflected in the v0.5.8 materials
4. **Update `library/docs/specs/README.md`** — add a "What's Shipped" column to the phase mapping table showing which "future" features are now live
5. **Consider a dev pack for mobile** — Android and iOS are building from the Desktop repo, but a mobile-specific dev pack could help bootstrap QA and responsive UI work

---

## Reading Order for New Team Members

1. **Start here:** [IFD Intro](../../../../../../library/guides/development/ifd/v1.2.1__ifd__intro-and-how-to-use.md) — understand the development methodology
2. **Then:** [Type_Safe Guide](../../../../../../library/dependencies/osbot-utils/type_safe/v3.63.4__for_llms__type_safe.md) — core type system used everywhere
3. **Then:** [Memory-FS Architecture](../../../../../../library/dependencies/memory-fs/v0.36.2__memory-fs__architecture-and-how-to-use-It.md) — storage abstraction
4. **Then:** [Specs README](../../../../../../library/docs/specs/README.md) — original product vision (with staleness caveat)
5. **Then:** The dev pack most relevant to your work
6. **For security context:** Read the 4 incidents in `library/sgraph-send/incidents/`
7. **For investor context:** Start with [Elevator Pitch](../../../../../../library/alchemist/materials/v0.5.8__pitch-deck__elevator.md)

---

*This debrief was created by the Librarian as an audit of `library/` at v0.13.6 (9 March 2026).*

https://claude.ai/code/session_01CukuzKWP2nfa1KxEH3w7vu
