# Alchemist — Proposed Items Index

**Domain:** alchemist/proposed/ | **Last updated:** 2026-05-24 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

Full content for each item is in the archived monolith: `../v0.16.26__what-exists-today.md` (sections noted).

---

## Investor-Facing Infrastructure

| Feature | One-Line Description | Monolith Section / Doc |
|---------|---------------------|----------------------|
| investor.sgraph.ai | Pitch vault library — interactive investor vault with curated content | Section 30, doc 300 |
| Investor site design | Website design for investor.sgraph.ai (open decision #16, unresolved) | Open decision #16 |
| Investor review workflow | Self-service LLM-assisted startup review tool for investors | Section 16 |
| Multi-LLM investor research | Research synthesis using Perplexity + Claude + Gemini in parallel | Section 16 |

## Content Ready for Publication

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| 5 LinkedIn articles | Drafted articles ready for publication (content exists, not published) | Section 16 |
| 6th LinkedIn article: "The Villager Phase" | Article about the Villager team methodology | Section 16 |
| Investor positioning: category expansion strategy | Strategic framing for category leadership positioning | Section 16 |

## Product Ecosystem

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| SG Vault Hub | GitHub-equivalent for encrypted vaults; change packs; optional public view | Section 16 |
| sgit.ai platform | Git interop, hosting, business model for SGit as standalone product | Section 16 |
| Ecosystem founder pack | "Build on SG/Send" developer pack for partners | Section 16 |
| Two-tier team model | Meta-team + project teams methodology for partner engagement | Section 16 |
| Partner dev pack template | `sgit-ai__vault__research-documents` template for partner onboarding | Section 16 |
| Multi-platform team spinup | Claude Code + ChatGPT + CLI + web setup guide for new teams | Section 16 |

## AWS Marketplace

| Feature | One-Line Description | Monolith Section / Doc |
|---------|---------------------|----------------------|
| Three AMIs for Marketplace | EC2/AMI deployment packages for AWS Marketplace listing | Section 30 |
| AWS Marketplace strategy | Positioning and listing strategy for Marketplace | Section 30 |
| AWS Conference outreach | Conference presence and developer outreach strategy | Section 30 |
| Personalised outreach workflow | Automated personalised outreach pipeline for prospects | Section 30 |

## Presentations and Content

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| OWASP submission | Title: "The Cambrian Explosion of AppSec Startups" — abstract drafted | Section 20 |
| OWASP white paper | 3-5 page white paper with SG/Send case study and 11+ AppSec company examples | Section 20 |
| OWASP slide deck | 20-30 slide deck outline | Section 20 |
| Updated Dinis bio | Biography reflecting SG/Send and agentic development work | Section 20 |

## Open Decisions (Alchemist Domain)

| Decision | Options | Status |
|----------|---------|--------|
| #16 — investor.sgraph.ai design | Unknown options | UNRESOLVED |
| #17 — Hero positioning line | RESOLVED: "Version-controlled, client-encrypted vaults. For humans and agents." | RESOLVED |
| #18 — Hero subhead | Three candidates under test | OPEN (test-driven) |

---

*Full content for all items: `../v0.16.26__what-exists-today.md` (Sections 15, 16, 20, 30)*

---

## Vertical Positioning and Commercial Strategy (05/17 briefs — Day 67, docs 431–434, 439)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-191 | Next-generation accountant companies positioning | Empowerment-not-replacement thesis; compliance engine to strategic partner; tier pricing £10-20/£40-60/£100-150 per active client per month; go-to-market through the firms | doc 431 |
| P-192 | Startup-idea vaults as Creative Commons business templates | 3-layer structure (investor pack template, startup-idea vaults, platform); 7 seed companies (CV, pitch, health score, evidence-research, accountant, lawyer, local AI enablement) | doc 432 |
| P-193 | MyFeeds B2B repositioning as evidence-pack research briefings | "Feed = evidence pack"; 5 pricing tiers (£2k–£50k+); information-overload-trust-gap frame; configurable depth = configurable cost | doc 433 |
| P-194 | SME GenAI adoption framework (external article) | Workflow-first go-to-market; democratising for senior experts; four prior tech transitions framing; "stop pitching the AI; start pitching the workflows" | doc 434 |
| P-199 | 33N Ventures research-vault programme | 4-vault structure (meta-vault, company research vaults, strategic outlook vault, private collaboration vault); 3 public + 1 private deliverable for Porto VC meeting | doc 439 |

## De-Commoditisation and Publishing (05/17 briefs — Day 67, docs 435, 437–438)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-195 | De-commoditising article (Wardley positioning) | Build-the-shield decision framework (5 factors); AI-era reframe (build economics dropped); shield is where operational expertise lives; external publication | doc 435 |
| P-197 | MyFeeds website rebuild — three-primitives architecture | Vault, storage substrate (server/S3/ephemeral/zip), management layer (vault-of-vaults); hybrid static + ephemeral recommended; 8-phase delivery | doc 437 |
| P-198 | Articles-as-vaults publishing workflow | Each article is a vault (evidence, semantic graph, source materials, multilingual, agentic provenance); website as presentation layer; our articles as canonical B2B examples | doc 438 |

---

## Agent Blast-Radius Company — Strategy and Business Model (06/18 series, v0.33.40)

All items below are PROPOSED — does not exist yet.

The June 18 series defines the company strategy for a service built around the vault technology
and focused on agent authorisation blast-radius mapping. Items below are business/strategy in
nature; the technical service items are in `ai-agents/proposed/` (P-353 to P-357) and
`security/proposed/` (P-358 to P-364).

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-365 | Agent Mandate (naming the authorisation bundle) | The recommended name for the bundle of identity, credentials, and business capabilities granted to an agent; "passport" critiqued (wrong register); "Agent Mandate" recommended for clarity, authority, and accountability framing | 06/18 strategy-brief (naming-the-agent-authorisation-bundle) |
| P-366 | Open-source-everything strategy | Everything the company does is open (code, logic, functionality, schemas); no proprietary core; the only closed line is the customer's own data and customisations; compete on execution and value, not rent extraction; adoption and stewardship of the core are the strategic prize | 06/18 strategy-brief (open-source-strategy) |
| P-367 | Commercial model: billable units + token markup + data hook | Granular billable units (cloud hyperscaler model); markup on every token consumed (OpenRouter model); data-is-the-hook (customer's private mandate data creates stickiness); hosting tiers (shared to dedicated VPC/account); security consultant marketplace; track recurring usage and adoption, not ARR | 06/18 strategy-brief (commercial-model) |
| P-368 | Vault strategy for blast-radius company (three roles) | Three vault roles: (1) publishing medium for website and investor deck (vault per section); (2) evidence base for per-provider blast-radius maps (GitHub, AWS, Salesforce, Claude tools, Open Claw); (3) delivery mechanism (the vault is what the customer runs to get customised analysis); MVP on existing technology | 06/18 arch-brief (vault-strategy) |
| P-369 | Customised-analysis-as-a-service (first business model) | Give the customer a delivery vault containing customised blast-radius analysis; they run it in their environment or we run it for them; the vault is the deliverable; first revenue stream | 06/18 arch-brief (vault-strategy) |
