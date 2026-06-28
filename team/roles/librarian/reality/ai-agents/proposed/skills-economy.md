# AI Agents — Proposed: Skills Economy and Partner Integrations

**Domain:** ai-agents/proposed/skills-economy | **Last updated:** 2026-06-28 | **Maintained by:** Librarian (B-003)
**Parent index:** [`index.md`](index.md)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

---

## Partner Integrations + Skills Ecosystem (05/30–06/01 briefs)

All items below are PROPOSED — does not exist yet.

### Partner Integration Stack

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-288 | Netlify AX Integration | Two deployment modes: Mode A (rendered output zip → Netlify deploys); Mode B (encrypted vault zip + Netlify edge function decrypts with public read key). Mode A for public library sites; Mode B for vault-native hosting. Depends on VIV for Mode B. | 05/30 brief |
| P-289 | Daytona Sandbox Integration | Vault holds code → Daytona runs it → results flow back to vault with provenance. Result return interface to be specified (stdout / structured JSON / artefacts). Stateful sandbox session contract for multi-round workflows. Blocks P-298 (comparison vault). | 06/01 brief |
| P-290 | Convex Reactive State Integration | Vault = source of truth; Convex = live working state layer. Sync boundary unspecified — what triggers commit from Convex to vault? Who holds vault write key in Convex-backed app? Zero-knowledge property must hold when Convex has live working state. BLOCKED on architect boundary document. Architecturally riskiest integration. | 06/01 brief |
| P-291 | Pi Coding Agent Harness Integration | Bidirectional base-vault ↔ Pi-Package mapping via open Skills standard. Pi adds agent harness + unified LLM API; does not duplicate vault storage model. Additive, low risk. | 06/01 brief |
| P-292 | HeyGen Video Agent Integration | HeyGen wrapped as a skill/connector on the MCP path. Vault content → script conversion (agent-side recommended); generated video stored back in vault with provenance edge to source content. | 06/01 brief |
| P-293 | Tavon White-Label AI Solutions | Channel/GTM decision; no development work from sg-send repo. Assign to Strategy/Ambassador. | 06/01 brief |

### Skills Creator Economy

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-294 | Semantic Knowledge Graphs for Agentic Skills | Document-to-graph pipeline (P-281) applied to SKILL.md files. Skill-specific edge types: prerequisite, composition, conflict, family, capability, provenance. Graph schema is a superset of P-281 compliance graph schema — one unified schema covers both. Persisted in base vault. Drives marketplace discovery (P-297) and comparison (P-298). | 06/01 brief |
| P-295 | Skill Base Vaults + Creator Economy | Base vault schema for skills: SKILL.md, code samples (multiple languages), guidance, evidence/credibility, certifications, tests/evals, threat model, security materials, version history. Open Standards format (agentskills.io). Base-to-customised promotion path. Creator reputation field (provenance-grounded, portable). Licensing metadata (base open/CC; customised commercial). | 06/01 brief |
| P-296 | Skills Creator Economy (Branded/Certified/Customised Versions) | Refinement of P-295. Three sellable versions on the open base: branded (creator brand), certified (creator-certified), customised (developed + certified + maintained by creator — the IP-bearing product). IP is specifically in the customised, maintained version. Maintenance as ongoing relationship (version control + provenance). | 06/01 brief |
| P-297 | Skills Marketplace with Scoring and Community Feedback | Marketplace built on Vault App Store. Composite vault-grounded scoring: provenance score, eval score, security score, behaviour/safety score, usage score, community feedback score, reputation score. Community feedback via sub-vault harvesting (reviews, endorsements, usage, issues) — all with provenance. Multi-marketplace publishing via open standard portable zip. Depends on P-295, P-294, Vault App Store (prior P). | 06/01 brief |
| P-298 | Skill Comparison + CLI-Wrapping + Token Optimisation | Three capabilities: (1) comparison vault — talk to candidates via vault chat (P-248), run in Daytona (P-289), rank with explainability, publish as cloneable public vault; (2) CLI-wrapping — arbitrary CLI wrapped in sandbox with tests, exposed as agent-usable skill; (3) token optimisation — broken-down optimised delivery sized to consumer's token budget and runtime context. | 06/01 brief |

---

## Skills Creator Economy — Deepened (06/02 briefs)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-300 | Skills as Business Knowledge Capture | Skills capture how a business function actually works — GDPR erasure workflow, finance approvals, legal sign-offs, etc. Previous knowledge bases failed as static/dead documents. The breakthrough: agentic maintenance makes living, updated skills sustainable. "Skills are massive" because every business function is a candidate. Relies on P-295 (base vaults) as container. | 06/02 strategy-brief |
| P-301 | Ownership + Maintenance Model for Delegated LLM Processes | Every delegated LLM process needs a named owner (human or agent team). Customisation triggers a maintenance relationship. Handover is the moment of value creation. Creators and brokers are the best owners. Price the responsibility (ongoing maintenance + accountability), not the bytes. Resolves "who is liable when an LLM process drifts?" | 06/02 strategy-brief |
| P-303 | Finance Team Skills with Multi-Level Customisation Cascade | Concrete use case: expenses, invoicing, POs, contracts, budgets, approvals, NDAs, due diligence. Multi-level cascade: corporate → group → cyber → ethics. Keep-in-sync is the hard value (when base skill updates, all customised versions get a sync prompt). Requires cascade-sync design (`OQ-cascade-sync-design-1`). Depends on P-295 (base vaults). | 06/02 strategy-brief |
| P-304 | Expert Brand Vaults — Ivan Ristic / TLS Example | Named expert (e.g. Ivan Ristic, ModSecurity/TLS) maintains a skills vault without seeing confidential customer data (anonymisation path: expert grades the skill class, not the confidential instance). Commercial model: open base vault + branded version + customised version + ongoing maintenance + token monetisation. Applies to any recognised domain expert. | 06/02 strategy-brief |
| P-305 | Monetising Skills on Aggregators (Tessl + Others) | Vault-layer-on-top of agent-skill aggregators (Tessl, Anthropic marketplace, Pi, etc.). Nine monetisation paths: customisation fee, token/usage, open-core, ownership+SLA, install-and-wire, usage-based, subscription, marketplace split, branded/white-label. Vault layer adds provenance, curation, and maintenance — complementary, not competitive. Depends on vault zip portability (P-295). | 06/02 research-brief |

---

## Skills Economy — Deepened (06/04 briefs)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-317 | Consulting-firm skills use case | Positioning page and example firm-methodology skill; T&M consulting inefficiencies named; service-to-product shift via skills | 06/04 strategy-brief (consulting-firms) |
| P-318 | Skills-as-software-packages model | Formalised taxonomy (macro/mini/micro skills); SKILL.md schema validation; intent-over-capability as the evolution of software packages | 06/04 strategy-brief (skills-are-software-packages) |
| P-319 | OWASP expert skills archetype | Evidence-as-deliverable skill packs for security experts; buy-side revenue streams; expert-as-quality-gate model | 06/04 strategy-brief (owasp-expert-skills) |
| P-320 | Skills-as-semantic-graph model | Skill as projection of typed-primitive semantic graph; forking ecosystem with open-source-tax governance | 06/04 arch-brief (skill-as-projection) |
| P-321 | Skill lifecycle tooling | Explorer→Town Planner progression tooling; high-token-spend as engineering problem; English-to-code as direction of travel | 06/04 strategy-brief (skill-lifecycle) |

---

## NHI 2.0 — Agent Identity (Cross-Domain Items from 06/04)

Items below are the ai-agents-specific cross-domain entries from the NHI 2.0 series. Full NHI 2.0 platform definition is in `../identity/proposed/index.md` (P-322 through P-336).

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-325 | Multi-identity agent chains | Signed, encrypted agent chains using vault inbox; per-agent identities and keys; capability limited by code — see identity/proposed P-325 | 06/04 arch-brief (multiple-identities) |
| P-328 | Agent trust scoring and web of trust | Trust by connectivity; agent trust scores built over time; distributed identity — see identity/proposed P-328 | 06/04 arch-brief (trust-and-identity) |
| P-332 | Skills-with-identity model | A skill bundles its own identity and permission set; joiner-mover-leaver lifecycle — see identity/proposed P-332 | 06/04 arch-brief (skills-and-permissions) |
