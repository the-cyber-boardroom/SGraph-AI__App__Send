# website/proposed — Index

**Domain:** `website/` | **Last updated:** 2026-05-17
**Source:** Archived monolith `../v0.16.26__what-exists-today.md` — Sections 16 (lines 1480–1509), 17 (lines 1516–1543), 19 (lines 1640–1738)

---

## Website Repo Extraction (BLOCKED — awaiting human action)

**Dev pack:** `library/sgraph-send/dev_packs/v0.22.6__website-repo-extraction/` (12 files)

| Phase | Status |
|-------|--------|
| Phase 1: Design | Done |
| Phase 2: Planning | Done |
| Phase 3: Execution | **BLOCKED** — human must create `sgraph-ai/SGraph-AI__Website` repo on GitHub first |
| Phase 4: QA | Not started |
| Phase 5: Release | Not started |

**Open questions:**
- Q1: Default branch `dev` or `main` for the new repo?
- Q2: Shared `sg-site-header` component strategy — in-repo or separate package?
- Q3: Disable or delete `deploy-website.yml` in Send repo on cutover?
- Q4: Keep a tombstone `sgraph_ai__website/README.md` in the Send repo?

---

## Website Redesign (v0.18.1 — 03/27, v0.19.4 — 03/27)

| Proposed Feature | Status |
|-----------------|--------|
| Theme explorer MVP — interactive theme switcher on the website | PROPOSED |
| Dark/light/brand/custom theming | PROPOSED |
| Aurora theme variations (8 palettes tested in theme tool) | PROPOSED |
| "Website evolution" content iteration | PROPOSED — ongoing |

---

## `<sg-theme>` Component — Vertical Expansion (v0.16.26 — 03/18)

| Proposed Feature | Status |
|-----------------|--------|
| `<sg-theme>` Web Component for vertical customisation | PROPOSED |
| Musicians vertical (audio components, production workflows) | PROPOSED |
| Ecosystem founder pack ("Build on SG/Send") | PROPOSED |

---

## Library Website (04/02 — brief, doc 217)

A dedicated documentation/examples site for the SGraph Send component library.
Separate from sgraph.ai. PROPOSED.

---

## Examples Website (04/13 — dev brief, doc 258)

Interactive examples: "Try It Now" demos, per-use-case showcase. Separate subdomain
or embedded in sgraph.ai. PROPOSED.

---

## Website Messaging + Vocabulary (04/17 — brief, doc 284)

Positioning updates: hero subhead candidates (test-driven, 3 candidates — open decision #18).
Vocabulary alignment for investor vs. user audiences. PROPOSED — partially delivered (hero
redesign shipped; subhead not yet decided).

*Full source: `../v0.16.26__what-exists-today.md` Sections 16–17 (lines 1480–1543), 19 (lines 1640–1738)*

---

## Agentic Newsroom / Publishing Products (05/12 briefs — docs 372, 378, 379, 380, 381)

### Newsroom Layout (doc 372)

| Proposed Feature | Status |
|-----------------|--------|
| 15 visible newsroom departments (inbox → corrections) | PROPOSED — does not exist yet |
| Provenance pages per story (production history, AI contributions) | PROPOSED — does not exist yet |
| Live newsroom view (current pipeline status) | PROPOSED — does not exist yet |
| Cost tracking per story | PROPOSED — does not exist yet |
| Department pages showing recent work | PROPOSED — does not exist yet |

### CV / Portfolio Products (doc 379)

| Proposed Feature | Status |
|-----------------|--------|
| `cv.sgraph.app` — hosted CV product | PROPOSED — does not exist yet |
| `portfolio.sgraph.app` — hosted portfolio product | PROPOSED — does not exist yet |
| Onboarding interview agent (builds first CV version) | PROPOSED — does not exist yet |
| CV/portfolio starter templates | PROPOSED — does not exist yet |
| Agency white-label dashboard (4th pricing tier) | PROPOSED — does not exist yet |

### Portugal Bilingual GenAI Publication (docs 380, 381)

| Proposed Feature | Status |
|-----------------|--------|
| Bilingual (PT+EN) vault-driven publication | PROPOSED — does not exist yet |
| Portuguese GenAI ecosystem knowledge graph | PROPOSED — does not exist yet |
| Daily publication cadence with agent + human review | PROPOSED — does not exist yet |
| Knowledge graph infographics (ecosystem map, funding flows, talent graph) | PROPOSED — does not exist yet |

## UI Proposed Items (05/12 brief — doc 377)

| Proposed Feature | Status |
|-----------------|--------|
| `<sg-video>` Web Component for encrypted vault video playback | PROPOSED — does not exist yet; cipher mode research required |

---

## Agent-Controlled Web + Vault Publishing (05/30–06/01 briefs)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-283 | Library as Shop Front + Multi-Agent Content Workflow | Library website rendered from vault; multi-agent content workflow (content vault + communications vault + FS email + dev/content/QA agents). Claimed working in website and sgit-ai repos — NOT code-verified in sg-send repo (OQ-library-rendering-verify-1). Assign to Librarian to verify in website repo. | 05/30 brief |
| P-285 | Agent-Controlled Websites + Vault CI Pipeline | Per-agent section vaults (ambassador/alchemist/journalist) + website vault as VIV parent (P-159/P-160); dev/QA/prod environment vaults; vault-to-vault promotion as CI step (commit-queue/sgit push); prod on separate server. BLOCKED on VIV browser verification (OQ-viv-phase2-browser-1). | 05/30 brief |
| P-286 | Per-Page Semantic Graphs + Edge Rendering | Lambda@Edge function extended from llms.txt to generate and cache per-page semantic graph; URL scheme `page.graph.json` (JSON-LD); cached on content change only; public vaults only — no edge-side decryption of private content. Foundation: llms.txt edge function in website repo (OQ-llmstxt-edge-verify-1). | 05/30 brief |
| P-287 | Industry Use-Case Pages with Embedded Vaults | Per-industry vault as VIV child of website vault; rendered as embedded section on industry page via public read key; per-industry engagement metrics. BLOCKED on VIV browser verification. | 05/31 brief |

---

## Blast Radius Strategy + Consultant Delivery (06/02 briefs)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-306 | Blast Radius Company Thesis — Website Positioning | Cybersecurity vertical framing: security change is business change; blast radius = zone of change from any security initiative; four-part thesis: side-effect taxonomy (neutral/negative-but-accepted/net-positive), don't become a choke point, open-source play creates sovereignty, visibility + digital twin of blast radius; many small fast-value solutions scale better than one large one; SG/Vault naturally maps onto this model as non-choke-point infrastructure. Translate into website cybersecurity landing page. | 06/02 strategy-brief |
| P-308 | Consultant Delivery Playbook — Website/Marketing | Practitioner-facing delivery model: run-your-own vault as consultant infrastructure (serverless single-tenant or self-hosted multi-tenant); eight-step engagement with two mandatory sign-offs (discovery + delivery); critical side-by-side rule (never replace a working system without running both in parallel long enough to prove value); commercial test (consultant time savings > customer change cost?); case-study compounding (each vault becomes a case study and template). Surface on website for consultant audience. | 06/02 strategy-brief |

---

## Evidence-Driven Mapping Website (06/22 briefs — v0.33.32)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-402 | Evidence-driven mapping website | A separate website cataloging specific use cases and AI-agent incidents as worked, detective-style mappings backed by near-unquestionable public evidence; method: reverse-engineer from a real incident (e.g. Replit July 2025 production database deletion — AI Incident DB 1152) to show what access made the harm possible, then recalculate the worst case the same access allowed (deletion is often the good case; corruption/manipulation/silent alteration are worse and harder to detect); maps permission to blast radius across environments (AWS, WhatsApp, etc.) with both malicious and non-malicious intent paths; each mapping carries a confidence score and states honestly where no public evidence exists; public sources: CWE, MITRE ATT&CK, MITRE ATLAS, CISA KEV, AI Incident Database, OECD AIM; architecture: vault per environment for each mapping set (e.g. one vault for AWS, one for WhatsApp); separate community vault processing comments, upvotes, and downvotes (Stack Overflow-style) for validation by security professionals and executives; purpose: validate the market hypothesis that awareness-of-real-risks drives demand and funding; uses the 14-field mapping schema from the self-contained incident-mapping brief (06/22); starter catalog of 14 real sourced incidents spanning destruction, exfiltration, persistence, and supply chain | 06/22 market-cases-and-graph/evidence-mapping-website-dev-brief |
