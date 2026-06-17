# AI Agents — Proposed Items Index

**Domain:** ai-agents/proposed/ | **Last updated:** 2026-05-21 | **Maintained by:** Librarian (daily run)

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
