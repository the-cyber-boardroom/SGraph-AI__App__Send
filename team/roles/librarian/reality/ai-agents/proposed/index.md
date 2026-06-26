# AI Agents — Proposed Items Index

**Domain:** ai-agents/proposed/ | **Last updated:** 2026-06-26 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

Full content for each item is in the archived monolith: `../v0.16.26__what-exists-today.md` (sections noted).

---

## LLM Component Family (sg-llm)

| Component | One-Line Description | Monolith Section |
|-----------|---------------------|-----------------|
| `sg-llm-connection` | Provider/key/model selector UI (standalone) | Section 19 |
| `sg-llm-reality` | Reality constructor — build model's complete context visually | Section 19 |
| `sg-llm-request` | Headless fetch engine, streaming chunk events | Section 19 |
| `sg-llm-output` | Streaming response display component | Section 19 |
| `sg-llm-stats` | Token counts, cost estimate, speed metrics per request | Section 19 |
| `sg-llm-debug` | Full request inspector (request + response JSON, timing) | Section 19 |
| `sg-llm-bundle` | Execution bundle manager (save/load/replay, fork tree with parent_id) | Section 19 |
| `sg-llm-bundle-list` | Bundle browser UI (time travel through saved requests) | Section 19 |
| `sg-llm-attachments` | File drop, clipboard paste, image/file cache for LLM input | Section 19 |

## Agentic Tool Execution

| Component / Feature | One-Line Description | Monolith Section |
|--------------------|---------------------|-----------------|
| `sg-tool-definition` | Visual editor for JSON tool schemas with validation and template library | Section 21 |
| `sg-json-sender` | Structured JSON construction with schema-aware input and payload preview | Section 21 |
| `sg-json-receiver` | Auto-detect text/tool_call/JSON; JSON tree viewer; diff view; schema validation | Section 21 |
| `sg-tool-runner` | Tool registration API; execute on tool_call; return JSON results | Section 21 |
| `sg-agentic-loop` | Full agentic orchestration: max iterations, cost budget, human-in-the-loop gate | Section 21 |
| `sg-sandbox` (JavaScript) | Sandboxed iframe + Web Worker; timeout enforcement; memory limits | Section 21 |
| `sg-sandbox` (Python/Pyodide) | Pyodide WASM in Web Worker; cached via sg-wasm | Section 21 |
| Trace visualisation | Clickable timeline of every tool call, result, and LLM response in loop | Section 21 |
| Built-in tools (8) | search_vault, read_file, write_file, list_folder, create_infographic, analyse_document, search_web, run_code | Section 21 |

## Multi-Agent Collaboration

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Multi-Agent Chat UI | Agent picker sidebar, multi-ask mode, debate mode, consolidator agent panel | Section 20 |
| One-shot feedback loop system | Bundle-as-vault with extract/prune cycle; SGit commit per loop; two-LLM pattern | Section 20 |
| Token Visualiser component | Context breakdown by section, growth graph, cost estimate | Section 20 |
| `@agent` code comment pipeline | Scan codebase for `@agent` comments; route to agent issue queues | Section 20 |
| Agent communication: signed EML messages | Agent-to-agent messages in vaults using PKI-signed EML format | Section 16 |
| Sequential workflow enforcement via PKI | PKI handoffs enforce order between agents in multi-step workflows | Section 16 |
| Message graph visualisation | Debug tool for visualising agent message graphs | Section 16 |

## Scheduled and Autonomous Tasks

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| Daily briefing assembly | 9:30 AM daily: reads Librarian + QA vault outputs, assembles brief | Section 19 |
| Website stats collection | Daily CloudFront/S3/Lambda metrics collection via agent | Section 19 |
| Email digest | Daily WorkMail inbox summary via agent | Section 19 |
| OKR tracker | Weekly review of progress against objectives | Section 19 |
| Multi-repo status | Daily check across main, QA, tools, CLI repos | Section 19 |
| Vault cleanup | Weekly cleanup of expired transfers and temporary vaults | Section 19 |
| Security scan | Daily SSL cert, headers, dependency audit | Section 19 |
| Task launcher unified shell | Unified shell for launching agentic tasks (doc 319) | Section 31 |
| 7 task-focused LLM components | Specialised components for 7 distinct task types (doc 318) | Section 31 |
| Agentic team setup pack creator | One-click pack to set up new team vault + SKILL.md + roles (doc 243) | Section 23 |
| Vault-driven CI | Agent manages CI by pushing to vault rather than Git | Section 31 |

## Developer Experience

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| One-shot LLM development environment | Visual IDE: context editor, code editor, live preview iframe, LLM panel | Section 19 |
| sg-git-graph Web Component | Interactive commit graph viewer; LLM thread visualisation mode | Section 20 |
| Intelligence tiers framework | Five-tier model (Frontier→Browser) for cost-optimised LLM routing | Section 23 |
| Pyodide browser vault (sgit via WASM) | Run sgit operations entirely in browser without CLI install | Section 16 |

## MCP Gaps (DOES NOT EXIST)

| Feature | Status |
|---------|--------|
| MCP `secrets_create` tool | DOES NOT EXIST — listed as gap |
| MCP `secrets_status` tool | DOES NOT EXIST — listed as gap |
| MCP `rooms_create` tool | DOES NOT EXIST — rooms API exists but not MCP-exposed |
| MCP `rooms_add_user` tool | DOES NOT EXIST |
| MCP `rooms_revoke_user` tool | DOES NOT EXIST |
| MCP transport backend for sgit | DOES NOT EXIST |

## sgit CLI Extensions (Proposed)

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| `sgit-ai sync <remote>` | Pull + push in one operation for multi-remote vaults | Section 19 |
| `sgit-ai dump --local / --remote` | Vault state diagnostics tool | Section 16 |
| `sgit-ai diff-state` | Local vs server comparison | Section 16 |
| `sgit share --auto` | Auto-refresh share token on every push | Section 18 |
| `.sgitignore` support | Pattern-based exclusion from vault commits | Section 16 |
| `.keep` files for empty directories | Git-compatible empty directory handling | Section 16 |

---

## Communication Vault Pattern (05/11 brief — doc 362)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Communication vault template | Structured vault: initial prompt + SKILL.md + messages folder for agent-to-agent messaging | doc 362 |
| Email-FS-light bidirectional protocol | Standardised bidirectional agent-to-agent message format in vault | doc 362 |
| Per-agent protocol pages | Audience-specific agent pages (Lovable, Claude Code, Cursor, ChatGPT) | doc 362 |

## Observable LLM Orchestration Tool (05/12 brief — doc 373)

Full 6-component tool built as SG/App, stored as vault:

| Component | One-Line Description | Source |
|-----------|---------------------|--------|
| Prompt inspector | Decompose and inspect prompt structure; token breakdown | doc 373 |
| Compression workbench | Test compression strategies on context windows | doc 373 |
| Tool router | Visualise tool selection decisions per request | doc 373 |
| Conversation graph | Non-linear conversation as graph (not linear chat) | doc 373 |
| Parallel analyst | Run same prompt against multiple models in parallel | doc 373 |
| Replay surface | Rerun prior conversations from any checkpoint | doc 373 |

## QA Stack on SG/Compute (05/12 brief — doc 374)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Vault-driven QA control surface (SG/App) | Test definition, execution, results — all stored in vault | doc 374 |
| iframe injection test runner | Fast in-process tests for our own pages | doc 374 |
| Playwright integration | Real browser automation for any site | doc 374 |
| Scheduling layer (cron-equivalent) | Run tests on intervals; requires SG/Compute cron support | doc 374 |

---

## Unified Observability Session (05/17 brief — doc 398)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Unified observability session REPL | Interactive session querying S3/CloudWatch/CloudTrail/billing/vault in one interface; no consolidated backend in v1 | doc 398 |
| Agent-trace feature | `agent-trace <agent> --session <id>`: pulls Bedrock calls + S3 reads + vault commits + costs into one trace | doc 398 |

## Bedrock CLI Native Support (05/17 brief — doc 404)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Bedrock CLI command tree | chat, agent, tool, kb, guardrail, eval, observe, meta sub-commands; abstracts Bedrock complexity behind clean CLI | doc 404 |
| Vault-grounded Bedrock sessions | Chat sessions, agent definitions, memory (short+long), tool traces, eval results, token usage all stored in vault | doc 404 |

---

## Observability Pipeline Concrete Sources (05/15 addendum — doc 407)

All items below are PROPOSED — does not exist yet.

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| CloudFront → Firehose → S3 as named observability source | Already-existing pipeline; source contract for the unified observability REPL to consume it | doc 407 |
| CloudTrail → S3 as named observability source | Already-existing pipeline; source contract for REPL; all AWS API call audit data | doc 407 |
| CloudWatch dashboard screenshot integration | `dashboard fetch/list/screenshot` commands; attaches AWS-rendered dashboard images to investigation records | doc 407 |
| Product analytics layer (layer 2 observability) | Distinct from infra observability: vault clones, downloads, conversion funnel, churn, feature usage | doc 407 |
| SG billing emission pipeline | Pre-auth micropayment events flowing into observability session as a first-class source | doc 407 |
| Per-customer reporting surface (layer 3 observability) | Customer-facing filtered view of their own usage and billing; depends on layer 2 substrate | doc 407 |

## AgentCore Resell Products (05/15 brief — doc 413)

All items below are PROPOSED — does not exist yet.

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Vault-Grounded Agent Hosting | AgentCore Runtime + vault-bound state, audit trail, and portability as a managed product | doc 413 |
| Multi-Region Agent Test Fleet | Container hosts + AgentCore Runtime + Evaluations + vault — QA-as-a-service product | doc 413 |
| Compliance-Bundled Agent Deployment | AgentCore Policy + Evaluations + vault audit trail packaged for regulated-industry customers | doc 413 |
| Multi-Provider Token Brokerage | Single Simple Token routes to AgentCore / OpenAI / Anthropic; one bill from SG | doc 413 |
| Specialised Manager Vaults as products | Pre-packaged manager vault templates (customer engagement, investor relations, compliance audit) | doc 413 |

*Full content for all items: `../v0.16.26__what-exists-today.md` (Sections 16–32)*

---

## Nova + AgentCore POC (05/16 briefs — doc 420)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-142 | FastAPI service with Nova model invocations | Micro / Lite / Pro / Premier endpoints; mini UI with model selector, prompt, result, cost, history | doc 420 |
| P-143 | FastAPI service with AgentCore agent invocations | Configurable tools (Browser, Code Interpreter); session management; memory | doc 420 |
| P-144 | Nova Act SDK integration for browser automation | Nova Act browser sessions against vault demo URLs; >90% accuracy on UI interaction tasks | doc 420 |
| P-145 | LLM-validated qualitative tests (fifth test layer) | Nova-powered "is this vault OK?" beyond structural assertions; complements unit/integration/QA/browser | doc 420 |
| P-146 | Per-invocation cost tracking log | Every LLM invocation: tokens in/out, cost estimate, latency, raw API response logged | doc 420 |

## Accountant Demo (05/16 briefs — doc 421)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-147 | Side-by-side two-persona demo environment | Four-pane UI: Actions / Accountant view / Client view / Narrative | doc 421 |
| P-148 | FastAPI orchestration service for demo lifecycle | sessions, setup, step/N, state, teardown endpoints; holds AWS credentials; idempotent | doc 421 |
| P-149 | Accountant + client vault apps with role-based routing | Same vault; `/accountant` and `/client` routes; different UX per role | doc 421 |
| P-150 | 12-step demo workflow | Setup → provisioning → vault loading → role interactions → report → approval → submission → confirmation → teardown | doc 421 |
| P-151 | Auto-teardown after 15-20 min idle | Prevents orphan demo sessions; reuses reset-on-activity timeout pattern | doc 421 |
| P-152 | Demo framework pattern | Reusable template for recruitment/news/risk demos; content work once infrastructure established | doc 421 |

## AppSec Mini-Tools (05/16 briefs — doc 423)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-159 | Threat-modelling mini-tool on vaults | StrideGPT (mrwadams) integration; STRIDE + OWASP LLM Top 10 + MAESTRO pattern detection | doc 423 |
| P-160 | Client-side mode: threat modeller in browser | Runs entirely in vault JS API context; no server-side compute; offline-capable | doc 423 |
| P-161 | Ephemeral compute-backed mode | FastAPI backend on SG/Compute; Fargate task per session; heavier analysis possible | doc 423 |
| P-162 | AppSec vault schema for threat artefacts | System descriptions, threat lists, attack trees, mitigations, evidence — all in vault | doc 423 |
| P-163 | SBOM analysis mini-tool (planned next) | syft/cdxgen integration; vault holds SBOM + change history; planned after threat modelling | doc 423 |
| P-164 | Dependency scanning mini-tool (planned next) | trivy/grype integration; vault tracks findings and fixes; planned after threat modelling | doc 423 |

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

## Vault Communications Demo + PKI (06/03 briefs)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-312 | Three-Agent Comms Demo Vault | Browser harness proving vault-to-vault messaging: 3 agents each with iframe inboxes; internal JS API (ping, send, receive, markReceived); step-by-step validation harness; manual round-trip proof first, then agentic via OpenRouter; key design principle: agents only share what they explicitly message (no full vault access); scale path 3 → 5 → 100s → 1000s; accountant experiment as first real use case. Depends on vault inbox (NOW EXISTS). | 06/03 dev-brief |
| P-315 | Skills Library as Platform Feature | A vault holding skills from multiple sources (Tessl, Anthropic, Pi, platform own). Library management: provenance tracking, sync from source, applicability scoring, evidence (screenshots, test results). Sharp insight: how-to-deploy-and-run knowledge fills a real gap (Claude couldn't run an Anthropic legal skill from a URL alone — deployment context was missing). Differentiator: talk-to-skill (on-demand vault instance), per-skill budgets, per-skill billing. Foundation for skills marketplace (P-297). | 06/03 strategy-brief |
| P-316 | SG/Vault as Platform of Primitives — Positioning | SG/Vault is a hyperscaler for shared state, not a category product. Dissolves the protocol/harness/workflow question by sitting beneath all three (noun, not verbs). Three-layer model: bottom (vault primitives), middle (heterogeneous agents/workflows/manual), top (bespoke UX). Two views: invisible-vault (users never see it) and builder-platform (developers see the structure). Restrict-to-unleash flywheel (tight primitive scope → safe, wide autonomy for builders). Superpower: builders are users of the same platform (tight feedback loop, features driven by real use). | 06/03 strategy-brief |

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

## NHI 2.0 — Agent Identity (Cross-Domain Items from 06/04)

Items below are the ai-agents-specific cross-domain entries from the NHI 2.0 series. Full NHI 2.0 platform definition is in `../identity/proposed/index.md` (P-322 through P-336).

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-325 | Multi-identity agent chains | Signed, encrypted agent chains using vault inbox; per-agent identities and keys; capability limited by code — see identity/proposed P-325 | 06/04 arch-brief (multiple-identities) |
| P-328 | Agent trust scoring and web of trust | Trust by connectivity; agent trust scores built over time; distributed identity — see identity/proposed P-328 | 06/04 arch-brief (trust-and-identity) |
| P-332 | Skills-with-identity model | A skill bundles its own identity and permission set; joiner-mover-leaver lifecycle — see identity/proposed P-332 | 06/04 arch-brief (skills-and-permissions) |

---

## Archiver-Cataloguer Pattern (06/15 briefs, v0.33.27)

All items below are PROPOSED — does not exist yet. Primitives are EXISTS (vault inbox, ephemeral compute, two-key model, vault CAS).

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-238 | Archiver-cataloguer generic workflow | Append to vault (two-key gating) → debounced trigger → ephemeral compute spins up → agent reads, catalogues, copies, appends, acts → result placed back in vault → ephemeral compute disappears | 06/15 arch-brief (archiver-cataloguer-pattern) |
| P-239 | Two-key-plus-authorised-keys ingestion gate | Ingestion gated by vault's accept-list of sender public keys; submitter must encrypt with vault PK and sign with sender PK; only pre-approved keys may append | 06/15 arch-brief (archiver-cataloguer-pattern) |
| P-240 | Debounced ephemeral-compute trigger | Interval or on-append trigger with debounce window to avoid multiple invocations from rapid successive uploads; per-use-case configurable | 06/15 arch-brief (archiver-cataloguer-pattern) |
| P-241 | Multi-vault chaining for cataloguer isolation | Source vault → cataloguing vault (transforms only; no full data access) → destination vault(s); prompt-injection blast radius limited to the cataloguing stage; enables multiple recipients without a single uber-vault | 06/15 arch-brief (archiver-cataloguer-pattern) |
| P-242 | Per-use-case cataloguing rules engine | Schema-based (not free-form prompt) rules defining what the agent does per use case: cataloguing, copying, appending, acting; one rules definition per deployment | 06/15 arch-brief (archiver-cataloguer-pattern) |
| P-243 | Transaction log archiving use case | Append-mode log entries → ephemeral compute → catalogued and indexed in destination vault; first use case (proves the generic loop) | 06/15 arch-brief (archiver-cataloguer-use-cases) |
| P-244 | Email and agent-messaging archiving use case | Incoming EML + sidecar → catalogued `mail/` tree in vault; agent-to-agent message ingestion path | 06/15 arch-brief (archiver-cataloguer-use-cases) |
| P-245 | Drag-drop file indexing (short-term and long-term modes) | Short-term: rapid indexing of dropped files in session vault; long-term: retention into Encrypted Spaces or persistent vault (depends on Encrypted Spaces PROPOSED); two distinct retention modes | 06/15 arch-brief (archiver-cataloguer-use-cases) |
| P-246 | Research ingestion use case | Document drops → chunked, catalogued knowledge base in destination vault; research ingestion pipeline | 06/15 arch-brief (archiver-cataloguer-use-cases) |

## Agentic Incident-Response Service (06/15 strategy brief, v0.33.27)

This is a service concept, not a build. No code deliverable until the workflow map is produced.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-247 | Agentic compromise incident-response service | "Who you gonna call" service for users whose privileged AI agents are compromised; rootkit-style threat model (access, resources, credentials, persistence); when-not-if posture; rebuild-reset-monitor remediation; aligned with security companies; SGraph offering vs separate venture open; next step is workflow map | 06/15 strategy-brief (agentic-compromise-incident-response) |

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
| P-399 | Observability-as-risk-dimension module | Six-vector framework that converts a capability map into a real-impact map; vectors: (1) Capture — whether and how much detail about privilege invocation is logged (none → request-only → full request and response); (2) Latency — log delay (weekly → daily → hourly → real-time); (3) Damage rate — how fast worst-case harm can scale, treating throughput limits as a time variable (seconds → minutes → hours → days); (4) Real monitoring — whether monitoring is active and watched (off/unwatched → watched in real time); (5) Response — whether a team and playbooks exist to act (none → drilled team with playbooks); (6) Detection confidence — whether detection has been drilled and measured (never → regularly, with measured confidence); each vector scored on a low-to-high maturity scale; together they modulate the risk score so a loud/detectable/slow/well-drilled risk scores lower than a quiet/fast/unwatched one of the same capability; all drawn from data that already exists in the customer's systems; re-mapped when the system changes; pending: risk formula combining six vectors with the capability score (OQ-observability-risk-formula-1) | 06/22 how-and-why-and-authorization/observability-arch-brief |
| P-400 | Potential mandate vs real mandate mechanism | Splits authorisation-to-request (potential mandate — the right to ask for an action without yet holding the credential) from the credential itself (real mandate — the means to act); the plain out-of-band credential model is the default and requires no code changes; the potential-mandate model is an opt-in upgrade that assumes the executing code cooperates and opens a just-in-time control point where evidence can be supplied and the request mediated; mediation options at the moment of use: short-lived token, synthetic/digital-twin execution (proxy simulates real service; digital-twin pattern), third-party executor (agent never holds credentials), delegation certificate checked centrally before execution; three separated capabilities: execute (performs the action), map (maps what the action means and its side-effects, done out of band), decide (chooses whether it happens); splitting potential from real yields real-time monitoring of privilege use; OAuth analogy: per-item consent is a step in this direction but the potential mandate goes further; working names for the terms; effort: significant; the out-of-band model is the near-term default | 06/22 how-and-why-and-authorization/potential-mandate-arch-brief |
| P-401 | Mandate-to-operate pattern | Business-facing pattern on the potential-mandate mechanism (P-400); a real-time, scenario-conditioned, evidence-gated bounded grant from the business, borrowed from incident-response practice (responders granted bounded authority to act quickly under pressure); requires a central real-time environment that holds privileges and checks evidence before releasing the grant; the enforcement gap: the bound must be enforced (not just stated) — a mandate narrower than the token's actual reach is hope-based (e.g. mandate to delete 10k records backed by a token that can delete 1M); enforcement requires the digital-twin execution layer and re-architecture of existing systems; the actor must provide evidence at the moment of action, which is where the why is captured (cross-ref: the why thread deferred in the how-not-why brief); first-generation mode is coarse (mandate = whole permission); maturity adds granularity, business-context conditions (in this situation, for this amount), and scenario-gated grants; explicitly a later-stage pattern, not the first generation; effort: significant | 06/22 how-and-why-and-authorization/mandate-to-operate-arch-brief |
| P-403 | Agent mandate graph | The agent-mandate ontology (decision, authorization, mandate, capability, control, action, delegation — extended from P-391) as a path-driven, text-first graph held in the vault as the database; avoids the blob problem (thousands of nodes render as a dot) by path-driven navigation — every node carries two distinct relationship types (outward: gives mandate to, is authorised to, delegates to, enables, performs; inward: received mandate from, is authorised by, delegated by, enabled by, performed by); built in two passes: pass 1 constructs the topic-scoped universe (AWS accounts, agentic workflows, or a specific path) by following relationships outward; pass 2 runs focused analysis and queries on that scoped graph through multiple lenses (actors, risk, stakeholders, risk-acceptance workflow); crown-jewels hypothesis: a well-rendered graph makes the blast radius understandable — map the crown jewels and test whether a path reaches them and whether that path can be detected (integrates P-399 observability vectors for detectability scoring); authored text-first in markdown in the vault, then visualised in JavaScript (D3.js or equivalent), then made queryable by an LLM; data moves through a load-extract-transform-save (LETS) pipeline; effort: moderate to significant | 06/22 market-cases-and-graph/agent-mandate-graph-arch-brief |

---

## Wardley Maps, Risk Acceptance Service, and Personal Scenario (06/23-24 briefs — v0.33.33)

All items below are PROPOSED — does not exist yet.

The June 23 series names the product (Risk Mandate.ai), maps the agent mandate strategic landscape as
eight Wardley maps, specifies the first buildable service (risk acceptance with no deny button), adds the
multi-stakeholder governance model on top, and opens the personal risk acceptance scenario as the first
concrete demo. The June 24 brief deepens the personal scenario with a question graph, typed evidence
classification, the lethal trifecta, and the email-access chain.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-404 | Wardley map series for the agent mandate landscape | Eight maps, each anchored at a user need (exec/use-AI-safely, risk-propagation, delegation, agent-as-user, security team, financial team, agentic vendor, competitive landscape), each drawn twice (reality today and with our service); the sharpest map is agent-as-user (mature execution and LLM at commodity; safe uninjected on-task decision at genesis); every component carries two extra node properties (evolution position: genesis/custom-built/product/commodity; and visibility); maps stored text-first in the agent mandate vault graph (P-403) so a map query is a graph query; the before/after state is a versioned property on the node; pending: review and challenge of all placements before visualisation of the flagship two maps (exec and agent-as-user); effort: small extension to P-403 schema | 06/23 wardley-maps/maps-brief and first-pass-eight-maps |
| P-405 | Risk acceptance service — no deny button | The first Risk Mandate.ai service: a user picks a scenario, receives a short flow of hairy evidence-backed risks (full data access, full business compromise, unlimited token liability) and there is no deny button — only time-boxed acceptance intervals (1h = need more data; 4h = P1 + incident response; 2d = smaller incident; 2w = funded project; 6m = do nothing, costs zero); the interval is when acceptance expires and must be renewed; compound risks roll up to a top risk; a stated control adjusts the level (not removes it); the demo rests on a graph-and-evidence structure with a customised view per persona backed by real incidents; a Gen AI layer (via OpenRouter) is optional; a vault can attach but is not required for the first pass; the service can show the cost-of-remediation sweet spot across scenarios and intervals; effort: medium | 06/23 risk-mandate-product-and-workflow/risk-acceptance-service-dev-brief |
| P-406 | Multi-stakeholder risk acceptance workflow | Governance model on top of P-405: an acceptance carries two independent dimensions (direction: get-more-data / reduce / increase / hold; and revisit interval: 1h / 4h / 2d / 2w / 6m); an exec never decides a risk not underwritten by the direct-line owner (CIO/CTO/CFO by dimension), the CSO, and GRC; accepted at the right altitude then propagates up to the CEO; largest risks escalate to the board; evidence can strike intervals off as physically impossible; a superior can override in either direction with the original preserved and the override attributed; no override buys a struck-off timeline — the only escape is ceasing the activity (stop-activity direction); approval attaches to a risk profile (not each instance); further instances of an approved profile are pre-approved as FYI; a profile change triggers re-approval; the workflow is modelled as a graph (nodes: risks, stakeholders, acceptances; edges: underwriting, propagation, override, pre-approval); blocked on: risk profile definition (OQ-riskprofile-definition-1) and shared acceptance schema (OQ-acceptance-schema-1); effort: large | 06/23 risk-mandate-product-and-workflow/risk-acceptance-workflow-arch-brief |
| P-408 | Personal risk acceptance scenario — first concrete instance | A curated question graph for a single user running a local LLM; questions establish account, on-disk credentials, logged-in accounts (Gmail/email/corporate DB), and data not belonging to the user; each answer typed as fact/opinion/hypothesis/evidence; first-pass evidence stored in browser local storage (no vault yet, user told explicitly); system generates per-user risk graph and presents risks to accept; lethal-trifecta check (reads untrusted content + internet-connected + can act on its own → exfiltration, corruption, destruction risks); email-access chain (email access → takeover of every account whose reset runs through it); each risk accepted for a chosen interval; graph supports stakeholder, assets, and workflows views; runs without an LLM (curated scenarios); phase two extends to external stakeholders and the delegation question (does the user have the right to grant these permissions?); effort: medium | 06/24 personal-risk-acceptance-dev-brief |
| P-410 | Agentic freelancing delivery model | Handover agents and micro-engagements: agentic workflows collapse the onboarding, briefing, and information-management costs that forced freelancing into long contracts; with a client-side handover agent, an engagement can shrink to a couple of productive hours; the freelancer provides skills (how they work, what they need, their questions); the client provides the brief; the handover agent collects and packages client materials shaped by the freelancer's skills so the human arrives maximally productive; billing is for productive time only; commitment is small; de-risked on billing; the goal is to guide current and future customers into this model so it scales; requires: operational workflow definition, freelancer-skills format, client-brief format, handover agent build, pilot engagement; effort: small for schema definition, medium for agent build | 06/23 agentic-freelancing/strategy-brief |
