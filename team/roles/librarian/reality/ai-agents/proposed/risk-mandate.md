# AI Agents — Proposed: Risk Mandate, Agent Authorization, and Assessment

**Domain:** ai-agents/proposed/risk-mandate | **Last updated:** 2026-06-28 | **Maintained by:** Librarian (B-003)
**Parent index:** [`index.md`](index.md)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

This file covers the Agent Authorization / Risk Mandate thread (June 18 onwards). It is the largest single topic in the ai-agents/proposed domain. Items are ordered chronologically by the brief that introduced them.

---

## Agent Authorisation Blast-Radius Service (06/18 series, v0.33.40)

All items below are PROPOSED — does not exist yet. Foundation (vault, inbox, semantic graph) EXISTS.

This service maps what an agent is authorised to do (the blast radius), not what it did.
Phase 1 works off read-only evidence. Multiple parties (agentic companies, clients, asset
owners, regulators) must all agree on the blast radius. The service is value-proposition-first.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-353 | Agent blast-radius mapping service (phase 1) | Read-only evidence ingestion; LLM parsers consume dashboards, security reports, configs, standards; correlated into an enterprise semantic graph showing what each agent can do; serves agentic companies, clients, asset owners, and regulators | 06/18 strategy-brief (agent-authorisation-blast-radius + agent-blast-radius-service) |
| P-354 | Multi-party risk acceptance flow | Named owners (agent developers, clients, asset owners, regulators) must all agree on the blast-radius map; mediated agreement mechanism; veto available; records are append-only signed vault entries | 06/18 strategy-brief (agent-blast-radius-service + risk-acceptance) |
| P-355 | Enterprise semantic graph for permissions | Ontology-of-ontologies model for agent permissions; per-company ontologies; second/third/fourth-order side effects on the graph; evidence with certainty ratings; extends NHI 2.0 semantic graph work (P-329–P-331) | 06/18 strategy-brief (graphs-of-graphs + side-effects) |
| P-356 | Proactive evidence database of agent-security scenarios | Public, open database of agent-security scenarios as vaults; each scenario covers a specific provider/agent/permission combination; CIA primitives plus graph-based deeper primitives; maintained and quality-controlled | 06/18 arch-brief (proactive-evidence-database) |
| P-357 | Paid agent-intel feed | Subscription feed over the proactive evidence database; subscribers receive new scenario vaults via vault inbox as they are published | 06/18 arch-brief (proactive-evidence-database) |

---

## Assessment Template, Case Study, and Supply-Chain Graph (06/19 series, v0.33.28)

All items below are PROPOSED — does not exist yet.

The June 19 series converts the blast-radius concept into concrete product deliverables:
a DPIA-extended supply-chain graph, a full assessment template simulated as if the platform
exists, the first concrete instance of the proactive evidence database (WhatsApp), and a
capture mechanism for in-context blast-radius mapping from real LLM interactions.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-376 | DPIA-extended supply-chain graph | Follow-the-data-then-check-for-agents: hyperlinked data-flow map with agent-access layer (accessed, modified, decided on) at every node; starts from familiar DPIA methodology; connects to P-355 (enterprise semantic graph) and P-373 (supply-chain propagation) | 06/19 arch-brief (supply-chain-permissions) |
| P-377 | Agent permission blast-radius assessment template | Complete assessment template simulated as if the platform exists: intake (integration, mode, identity, permissions, data in reach, actions possible, other parties, environment, duration), permission graph, blast-radius view scored by reach/reversibility/parties, risk-acceptance flow (owner → boss → exec → risk owner; accept/narrow/remove), evidence vault, multi-stakeholder lens (one graph, per-party reads) | 06/19 arch-brief (assessment-template) |
| P-378 | WhatsApp evidence vault (first proactive evidence database instance) | Three scenarios (personal/dedicated/Business) with permission maps, blast-radius scores, and real incidents: WhatsApp ban policy, documented account ban, runaway agents, GhostPairing attack (attacker mirror of same mechanism); built from public sources; first concrete instance of P-356 | 06/19 research-brief (whatsapp-case-study) |
| P-379 | LLM interaction capture with consent | When a user interacts with an LLM on a captured path and has consented, record the interaction and map the in-context blast radius; consent is structural and must be recorded in the vault before any capture; in-context assessments reflect real interactions, not theory | 06/19 dev-brief (use-cases-user-stories, Story 8) |

---

## Odysseus Evidence Vault, Formal Ontology, and Assessment Platform Modules (06/20 series, v0.33.30)

All items below are PROPOSED — does not exist yet.

The June 20 series deepens the Agent Mandate work with a real worked example (Odysseus),
formalises the domain into a shared ontology, and adds assessment-platform rendering modules.
The lethal-trifecta test (private data + untrusted content + ability to act/send) is now a
first-class completeness check derived from this series.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-387 | OpenRouter web-search + PDF file-parser plugins | Real-time web search (for deep-research and proactive-evidence agents) and PDF processing (for document assessment) via OpenRouter plugins; removes need for two separate integrations; self-hosted BYO alternative needed for run-everywhere path | 06/20 openrouter-platform |
| P-389 | OpenRouter presets + prompt caching + cost-aware routing | Server-side saved prompt/model/routing configs per agent role (versioned, matching Librarian/Architect/Ambassador roles); prompt caching requires stable system-prompt prefix for cache hits; model fallbacks + auto-router for no-new-cost-base discipline; ~5% OpenRouter markup to factor into pricing model | 06/20 openrouter-platform |
| P-390 | Odysseus evidence vault (third proactive-evidence-database instance) | Three-document vault covering Odysseus: (1) case study — lethal-trifecta analysis, mandate map, privacy-vs-safety distinction; (2) compromise mapping — capability-to-reality translation, harm taxonomy applied to Odysseus; (3) third-party impact — seven party types with consent gap; built from public sources; third instance of P-356 family (WhatsApp = P-378) | 06/20 odysseus-mandate-analysis |
| P-391 | Agent Mandate formal ontology (shared data model) | 16 core entities (Principal, Agent, Mandate, Capability, Tool, Action, Asset, Party, Harm, Risk, RiskAcceptance, Evidence, Environment, IntegrationMode, Control, Provenance); relationship graph; 8 taxonomies (party, asset, action/harm, capability/tool, integration mode, certainty, risk state, evolution); ontology-of-ontologies layering (stable core + per-company + per-audience); master vault holds core; single shared model for assessment, blast-radius graph, compliance subset, third-party mapping, PBOM, and supply chain | 06/20 ontology-and-naming |
| P-392 | Capability-to-reality translation layer | Render-time transformation mapping technical capability to accurate plain-language consequence (e.g. "access to files" → "access to credentials, tokens, keys, and live sessions"); translation table stored as vault config (updatable per deployment); harm taxonomy classification (eight categories: access, delete, corrupt, corrupt irreparably, act on behalf, exfiltrate, contact others, affect third parties); irreparability as structured property of environment (journaling vs overwrite-in-place) | 06/20 compromise-mapping |
| P-393 | Third-party consent gap module | Per-party blast-radius view for seven party types (individuals, companies, peer executives, departments, government agencies, customers, vendors); for each: assets reached, impact, consent gap; "mandate-the-user-cannot-rightfully-grant" analysis; extension of assessment template (P-377) multi-stakeholder lens; cross-org boundary flag for supply-chain cases; third-party notification/acceptance path for integrations where blast radius reaches others' assets | 06/20 third-party-impact |

---

## Authorization Ontology and Delegation (06/21 briefs — v0.33.31)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-394 | Authorization moment-of-grant principle module | Standalone artifact stating the core principle: authorization = moment of grant, not action; risk begins at the grant; three mandate channels (account, file, direct/indirect capability); three-step method (map capabilities → connect side-effects → map risks for all stakeholders); cross-reference anchor for PBoM assessments and the Agent Mandate framework | 06/21 authorization-ontology/strategy-brief |
| P-395 | Hope-based authorization detector and defeasible-control classifier | Distinguishes authorization boundaries (capability scoped so action is impossible) from defeasible controls (refusal-hoping layers); identifies chain-scenario blind spots where accumulated context launders legitimacy; marks controls in agent-capability maps as defeasible, not as limits; generates the "one authorization, two control outcomes" visualization for any agent configuration; requires `defeasible` property on Control entity in P-391 | 06/21 authorization-ontology/arch-briefs |
| P-396 | Mandate-as-delegation check module | Validates whether a grantor has the right to delegate (separate entitlement, PassRole pattern) before recording a grant; checks stakeholder authorization of delegation recursively to the ultimate accountable entity; classifies agentic grants as key-handovers (blast actions) vs direct-action grants; flags everyday grants (email, document) where implied scope is read-only and agent-handling consent was never given; requires `DelegationRight` entity in P-391 | 06/21 mandate-and-delegation/arch-brief |
| P-397 | Delegation scenarios assessment module | Ten-scenario mapping (plain email, document/attachment, implied confidence, NDA, contractual handling, regulated data, encrypted vault, WhatsApp/E2EE, multi-hop compounding, agent-to-agent chains); each scenario maps sender expectation vs reality-with-agent vs legal question; vault shown as scoped-revocable-visible contrast; feeds case studies, assessment intake, and investor materials; not legal advice | 06/21 mandate-and-delegation/strategy-brief |

---

## How-Not-Why Scope, Risk Modulation, and Mandate Architecture (06/22 briefs — v0.33.32)

All items below are PROPOSED — does not exist yet.

The June 22 series sharpens the first-generation scope (explain how, not why), adds two architectural
mechanisms (observability-as-risk-dimension and the potential/real mandate split), names a later-stage
pattern (mandate to operate), and introduces the agent mandate graph as a build target.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-399 | Observability-as-risk-dimension module | Six-vector framework that converts a capability map into a real-impact map; vectors: (1) Capture — whether and how much detail about privilege invocation is logged; (2) Latency — log delay; (3) Damage rate — how fast worst-case harm can scale; (4) Real monitoring — whether monitoring is active and watched; (5) Response — whether a team and playbooks exist to act; (6) Detection confidence — whether detection has been drilled and measured; each vector scored on a low-to-high maturity scale; together they modulate the risk score; all drawn from data that already exists in the customer's systems; pending: risk formula combining six vectors with the capability score (OQ-observability-risk-formula-1) | 06/22 how-and-why-and-authorization/observability-arch-brief |
| P-400 | Potential mandate vs real mandate mechanism | Splits authorisation-to-request (potential mandate — the right to ask for an action) from the credential itself (real mandate — the means to act); the plain out-of-band credential model is the default; the potential-mandate model is an opt-in upgrade; mediation options at the moment of use: short-lived token, synthetic/digital-twin execution, third-party executor, delegation certificate checked centrally; splitting potential from real yields real-time monitoring of privilege use; effort: significant | 06/22 how-and-why-and-authorization/potential-mandate-arch-brief |
| P-401 | Mandate-to-operate pattern | Business-facing pattern on the potential-mandate mechanism (P-400); a real-time, scenario-conditioned, evidence-gated bounded grant from the business; borrowed from incident-response practice; requires a central real-time environment that holds privileges and checks evidence; the enforcement gap: the bound must be enforced, not just stated; enforcement requires the digital-twin execution layer and re-architecture of existing systems; explicitly a later-stage pattern, not the first generation; effort: significant | 06/22 how-and-why-and-authorization/mandate-to-operate-arch-brief |
| P-403 | Agent mandate graph | The agent-mandate ontology (decision, authorization, mandate, capability, control, action, delegation — extended from P-391) as a path-driven, text-first graph held in the vault; path-driven navigation avoids the blob problem (thousands of nodes render as a dot); two passes: pass 1 constructs the topic-scoped universe by following relationships outward; pass 2 runs focused analysis through multiple lenses (actors, risk, stakeholders, risk-acceptance workflow); crown-jewels hypothesis: a well-rendered graph makes the blast radius understandable; authored text-first in markdown, then visualised in JavaScript (D3.js), then made queryable by an LLM; data moves through a load-extract-transform-save (LETS) pipeline; effort: moderate to significant | 06/22 market-cases-and-graph/agent-mandate-graph-arch-brief |

---

## Wardley Map Series, Risk Acceptance Services, and Agentic Freelancing (06/23–06/24 briefs — v0.33.33)

All items below are PROPOSED — does not exist yet.

The June 23–24 series names the product (Risk Mandate.ai), produces the first Wardley map series for the strategic landscape, specifies the first two buildable services (risk acceptance service and multi-stakeholder workflow), instantiates the first personal scenario (local LLM, lethal trifecta), and opens an agentic freelancing workflow pattern. Key decision: OQ-company-name-1 resolved — the product is **Risk Mandate.ai**.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-404 | Agent mandate Wardley map series | Eight maps, each anchored at a user need and drawn twice (reality today vs. with our service); user needs: exec (use AI safely), understand/propagate risk, delegate mandates without liability, agent-as-user (ask/receive/check permissions, decide, execute), security team, financial team, vendor, competitive landscape; agent-as-user map is sharpest — execution is commodity, safe decision is genesis; stored in the agent mandate vault graph (P-403) as nodes with `evolution_position` and `visibility_to_user` attributes; first-pass tables authored, to be challenged and visualised; effort: low to moderate | 06/23 wardley-maps/ |
| P-405 | Risk acceptance service MVP | Scenario-picker flow presenting 2–3 hairy, evidence-backed risks with no deny button; five time-boxed intervals (1 hour = need more data / 4 hours = P1 / 2 days = smaller incident / 2 weeks = funded project / 6 months = do nothing, costs zero); risks compound and roll up to a top risk; each acceptance expires at its interval and must be renewed; demo rests on the multi-persona agent mandate graph (P-403) and an evidence structure; per-persona customised views backed by real incidents; optional Gen AI layer via OpenRouter; vault connection optional to start; first product delivery of Risk Mandate.ai; effort: moderate | 06/23 risk-mandate-product-and-workflow/risk-acceptance-service-brief |
| P-406 | Multi-stakeholder risk acceptance workflow | Two-dimensional acceptance model (direction: get-more-data/reduce/increase/hold; revisit interval: when acceptance expires); exec decisions require underwriting from direct-line owner (CIO/CTO/CFO by dimension), CSO, and GRC; accepted risks propagate upward to CEO and sometimes the board; evidence can strike intervals off as physically impossible; a superior can override in either direction with the subordinate's original preserved; approval attaches to a risk profile (not each instance); re-approval required when risk profile changes; the workflow is a graph; requires ontology extension: RiskProfile, UnderwroteBy, PropagatedTo, OverriddenBy, EvidenceConstraint; effort: significant | 06/23 risk-mandate-product-and-workflow/risk-acceptance-workflow-brief |
| P-408 | Agentic freelancing workflow | Handover agent on the client side collects and packages briefing materials guided by the freelancer's published skills; skills encode how the freelancer works, what they need, and the questions they ask (SKILL.md variant); micro-engagement (2-hour) is viable because onboarding cost is near-zero with agents on both sides; vault-based handover scopes and protects materials per engagement; effort: low to moderate | 06/23 agentic-freelancing/ |
| P-409 | Personal risk acceptance scenario | Curated question graph walking a personal user through the local-LLM scenario; six questions typed as fact/opinion/hypothesis/evidence; first-pass evidence stored in browser local storage; risk graph generated from answers (not generic risks); two concrete chains: (1) lethal trifecta — if reads untrusted content AND internet-connected AND can act autonomously → exfiltration, corruption, and destruction risks; (2) email-access chain — email access = every account that resets through it can be compromised; each risk accepted for a chosen interval; runs without an LLM (curated scenarios); next phase adds external stakeholders and the right-to-delegate question; first validation case for Risk Mandate.ai; effort: moderate | 06/24 personal-scenario-brief |

---

**Note on P-numbering:** A minor discrepancy exists between the P-numbers assigned in this domain file and the June 26 master index for the P-404–P-410 range. The numbers in this file (P-408 = agentic freelancing; P-409 = personal scenario) were assigned at the time the domain file was updated; the master index uses (P-408 = personal scenario; P-410 = agentic freelancing). Use the description, not the number, when resolving ambiguity.
