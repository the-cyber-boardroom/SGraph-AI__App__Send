# Alchemist — Reality Index

**Domain:** alchemist/ | **Last updated:** 2026-07-28 | **Maintained by:** Librarian (daily run)

This domain covers investor-facing materials, the Alchemist system (Town Planner team output), and business strategy documents. The Alchemist role translates technical output into investment and business value. Note: items in this domain are documents and strategic materials, not code features.

---

## EXISTS (Documents Verified)

### Investor Materials

| Document | Path | Date | Notes |
|----------|------|------|-------|
| Investor One-Pager | `library/alchemist/materials/v0.13.12__investor-one-pager__sg-send.md` | 10 March 2026 | References "30 paying customers" and "592 tests" (from v0.13.12 inventory — may differ from current code-verified count) |
| Competitive Positioning Matrix | `library/alchemist/materials/v0.13.12__competitive-positioning-matrix__sg-send.md` | 10 March 2026 | |
| Comprehensive Inventory (March 1–10) | `team/town-planner/roles/alchemist/reviews/03/10/v0.13.12__librarian-debrief__comprehensive-inventory-since-march-1.md` | 10 March 2026 | |

### Alchemist Materials Library

- **Path:** `library/alchemist/`
- **Structure:** narratives/, materials/, investors/, due diligence/
- Contains narrative documents, positioning materials, investor relations content, and due diligence preparation

### Positioning Decision (Code-Verified as RESOLVED)

- **Open Decision #17 RESOLVED** (04/21): Hero positioning line DECIDED: "Version-controlled, client-encrypted vaults. For humans and agents."
- Website v0.2.0 (`sgraph_ai__website/v0/v0.2/v0.2.0/`) carries this positioning live.

### Competitive Research

- 8 claims evidence-backed (03/27, v0.18.2 research)
- Multi-role review: Designer, Ambassador, Architect, Sherpa (03/27)
- Conductor implementation spec synthesised from all roles (03/27)

### Platform Vision (Documented, Partially Shipped)

| Layer | Status |
|-------|--------|
| Send (file sharing) | SHIPPED |
| SGit (vault versioning) | SHIPPED |
| Vault (encrypted VFS) | SHIPPED |
| Rooms (data rooms) | SHIPPED (API exists; UI partially v0.2.x base) |
| PKI (public key infrastructure) | SHIPPED (key registry, sgit keygen/sign/verify) |
| Agentic (AI agent primitives) | PARTIALLY SHIPPED (MCP, vault peer verified) |

### SGit Standalone Product Position

- **SGit-AI PyPI package** (`sgit-ai`) — SHIPPED as separate product
- **SGit-AI GitHub organisation** — EXISTS (`SGit-AI/SGit-AI__CLI`)
- **sgit.ai** — static S3 + CloudFront website EXISTS

---

## PROPOSED (Not Yet Implemented)

- investor.sgraph.ai pitch vault library — interactive investor vault (doc 300, Section 30)
- Investor site design — open decision #16 UNRESOLVED (no decision on design direction)
- 5 LinkedIn articles ready for publication (drafted, Section 16)
- 6th LinkedIn article: "The Villager Phase" (drafted, Section 16)
- Investor positioning: category expansion strategy (Section 16)
- Investor review workflow (self-service LLM startup review) (Section 16)
- Multi-LLM investor research (Perplexity + Claude + Gemini) (Section 16)
- SG Vault Hub — GitHub-equivalent for encrypted vaults, vision document (Section 16)
- OWASP presentation: "The Cambrian Explosion of AppSec Startups" (abstract drafted, Section 20)
- AWS Marketplace strategy (three AMI types) (Section 30)
- Two-tier team model methodology for partner dev packs (Section 16)
- Ecosystem founder pack ("Build on SG/Send") (Section 16)

### New PROPOSED Items (06/02 briefs)

| # | Item | Status |
|---|------|--------|
| P-309 | **Investment Strategy — Why Now + Alchemist Guidance** — investment thesis: operationalisation breakthrough + initial PMF as "why now"; use-of-funds model (humans own areas, agentic teams execute); foundational platform play; revenue: consumption/credit + model-access markup (25% OpenRouter premium) + premium gen-AI; B2C2B go-to-market; investor-as-user thesis; open-source as sovereignty signal; compliance via disclaimer; needs Alchemist session to translate into investor materials | PROPOSED — does not exist yet |
| P-310 | **Investor Disclaimer Options for sgraph.ai/invest/the-ask** — five disclaimer versions (A: very short / B: short / C: moderate / D: comprehensive / E: most protective); open-company positioning with gated investment opportunity; needs compliance adviser review before going live; currently draft options only, not live on site | PROPOSED — does not exist yet |

### Evidence Economy (07/05 briefs — docs 817–819)

**PROPOSED — does not exist yet.** Three-part commercial arc from news-backed vaults → force of proof → supplier playbook.

| # | Item | Status |
|---|------|--------|
| P-817 | **News-backed evidence vaults** — separate SG/Send vault run as a small editorial news organisation; news-graph-to-risk-graph connection (source-node-to-risk-node edges; citation is the flow, not a footnote); future-of-news stack applied to risk (MyFeeds, Trust-as-a-Service, semantic knowledge graphs, author micropayments); first deliverable: demonstrator vault with Replit DB deletion + EchoLeak incidents as first two evidence entries | PROPOSED — does not exist yet |
| P-818 | **Evidence economy: force of proof, fact certification, two prices** — executive accountability + graph traceability = force of proof; two-pillar split: risk-acceptor (owns decision + consequence) vs fact-certifier (owns truth of inputs, carries warranty if guarantee fails); two prices visible simultaneously: cost-of-good-data (narrow the confidence band) + cost-of-underwriting (carry wide band); certified evidence as commercial product for news organisations, research institutes, internal departments | PROPOSED — does not exist yet |
| P-819 | **Evidence packs as a service** — agentic-friendly API; sells legwork/graph (evidence trails) not finished article prose; LLM-maintains-the-graph inversion (journalist owns ground, LLM maintains semantic knowledge graph at scale); SG vault as evidence pack container (versioned, sovereign, sold like skills); per-call on-demand micropayment model, no lock-in; per-company personalisation at scale (one graph, many language/culture renderings) | PROPOSED — does not exist yet |

### Agent Risk Thesis (07/05 briefs — docs 814–815)

**PROPOSED — strategy documents, no code.** Board-facing thesis on agentic catastrophic failure risk, paired with communications discipline.

| # | Item | Status |
|---|------|--------|
| P-814 | **Agent catastrophic failure board thesis** — adding agents increases catastrophic-failure risk because containment is immature; host-privilege blast radius (agent inherits full permissions of host account); accept-first-then-mitigate sequence (put risk on register, named, owned, time-bound, before designing mitigation); grounded in Replit DB deletion (July 2025) and EchoLeak/CVE-2025-32711 | PROPOSED — does not exist yet |
| P-815 | **Grounded alarm communications discipline** — not FUD: keeps legitimate alarm, replaces uncertainty with certainty (known mechanism) and doubt with proof (documented incidents); weather-warning standard (frightening, calibrated, trusted, action-oriented, always grounded in a measurement reading); credibility loop: grounded alarm pays into credibility over time, FUD erodes it | PROPOSED — does not exist yet |

### Plug Profile Model — RiskMandate (07/24 briefs — docs 847–859)

**PROPOSED — does not exist yet.** Thirteen strategy briefs develop the plug-pull governance model. None of the items below are implemented.

| # | Item | Status |
|---|------|--------|
| P-PLUG-001 | **Five-dimension plug profile model** (who, blast radius, speed, side effects, recoverability) — replaces binary yes/no assessment of AI system stoppability | PROPOSED — does not exist yet |
| P-PLUG-002 | **Fractal plug maturity model of maturity models** — decomposes "can we stop our AI systems?" to facts and evidence at every altitude using the same register machinery | PROPOSED — does not exist yet |
| P-PLUG-003 | **Plug-pull MVP/demo anchor** — tabletop exercises from simple scenarios (calendar, email, customer database) with digital twin grounding; proposed as the RiskMandate demo entry point | PROPOSED — does not exist yet |
| P-PLUG-004 | **Plug register data model** — plug_profile schema with recoverability as first-class queryable field, delegation chains, on-call coverage windows, acceptance_interval | PROPOSED — does not exist yet |
| P-PLUG-005 | **Zero-recoverability query** — flagship maturity probe: all accepted risks where recoverability = 0; stops the field being set high to shorten the list | PROPOSED — does not exist yet |
| P-PLUG-006 | **Standards/regulation crosswalk** — EU AI Act Article 14 human oversight, incident-response functions vs plug profile dimensions; requested by voice-memo pillar | PROPOSED — does not exist yet |
| P-PLUG-007 | **Recoverability scoring scale** — ranks irreversible risk above larger recoverable risk; encodes the finding that likelihood×impact scoring ranks irreversible risks exactly wrong | PROPOSED — does not exist yet |
| P-PLUG-008 | **Plug-loaded observability** — logging oriented toward the stopping decision rather than generic system logs; 12–18h hyperscaler detection floor encoded as a constraint | PROPOSED — does not exist yet |
| P-PLUG-009 | **Simple scenarios library** — tabletop plug-pull scenarios for demo and maturity assessment | PROPOSED — does not exist yet |
| P-PLUG-010 | **Plug-pull series publication** — pillar (voice-memo model canonical) + recoverability + governance-reframe + maturity-close + never-in-line; blocked pending model reconciliation | PROPOSED — does not exist yet |

**Open conflict (blocking publication):** Voice-memo pillar (detection/decision/blast-radius/reversibility intersecting in time) and series pillar (five-dimension static profile) are incompatible as shipped. Day-index recommends keeping voice-memo pillar canonical. Decision not yet taken.

### OSMM — Ontology Sovereignty Maturity Model (07/24 briefs — docs 860–862)

**PROPOSED — does not exist yet.** Three briefs (one arch, one research, one strategy) introduce and apply a new fractal maturity model for ontology sovereignty.

| # | Item | Status |
|---|------|--------|
| P-OSMM-001 | **OSMM five-predicate query engine** — evaluates Readable, Portable, Modifiable, Survivable, Provable against any ontology node at any altitude; level is a graph query result, not a narrative claim | PROPOSED — does not exist yet |
| P-OSMM-002 | **Change-of-Control Stress Test** — automated check that an OSI licence does not survive an acquisition; Survivable depends on distributed copyright and foundation-held trademark | PROPOSED — does not exist yet |
| P-OSMM-003 | **OSMM Assessment report format** — scored artefact, counter-evidence queries, bounded-above vs measured distinction; first instance applied to Palantir Foundry and Scrydon (both Level 1) | PROPOSED — does not exist yet |
| P-OSMM-004 | **SGraph self-assessment against OSMM** — prerequisite to publishing the model; trademark leg currently failing; must be completed before any vendor assessments are published | PROPOSED — does not exist yet |
| P-OSMM-005 | **OSMM conjunctive level vs coverage report** — strict weakest-link composition for migration realism vs progress reporting distinction | PROPOSED — does not exist yet |
| P-OSMM-006 | **Bounty milestone triggers as OSMM level transitions** — payment triggers expressed as L1→L2, L2→L3 predicate satisfaction rather than delivery milestones | PROPOSED — does not exist yet |
| P-OSMM-007 | **CADA / SPDX / W3C / FAIR crosswalk to OSMM levels** — satisfying an OSMM level demonstrably satisfies a requirement in each framework | PROPOSED — does not exist yet |
| P-OSMM-008 | **OSMM publication** — the model, self-assessment, vendor scorecards, and counter-evidence queries; blocked pending self-assessment | PROPOSED — does not exist yet |

### Sovereignty Bounty Programme (07/24 briefs — doc 862)

**PROPOSED — does not exist yet.** Grant and bounty programme paying for migration off proprietary platforms, milestones paid on customer survival rather than code delivery.

| # | Item | Status |
|---|------|--------|
| P-SOV-001 | **Migration bounty programme** — milestones paid on customers still there at 6 and 12 months; harder migration = larger bounty; the price is the finding | PROPOSED — does not exist yet |
| P-SOV-002 | **Difficulty pricing model** — bounty difficulty priced before the attempt rather than after; who administers it and at what altitude (open) | PROPOSED — does not exist yet |
| P-SOV-003 | **Vendor-sponsored exit independence mechanism** — governance structure separating genuine no-lock-in claim from a marketing exercise the vendor scopes itself | PROPOSED — does not exist yet |
| P-SOV-004 | **EU Data Act window positioning** — switching charges prohibited from 12 January 2027; six-month positioning window; right to switch with no proof switching works | PROPOSED — does not exist yet |
| P-SOV-005 | **Bounty administration model** — who runs the programme, at what altitude, how difficulty is priced before the attempt | PROPOSED — does not exist yet |

*Full proposed items: [proposed/index.md](proposed/index.md)*

---

## Sub-files

*Currently all content is in this index. When this file exceeds ~300 lines, sub-files will be created.*
