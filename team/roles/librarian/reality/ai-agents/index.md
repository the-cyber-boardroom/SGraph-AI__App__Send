# AI Agents — Reality Index

**Domain:** ai-agents/ | **Last updated:** 2026-08-24 | **Maintained by:** Librarian (daily run)

This domain covers agentic workflows, LLM components, Claude integration with vaults, MCP (Model Context Protocol), and the vault-as-communication-channel primitives. The SG/Send architecture is explicitly designed for agents as first-class users alongside humans.

---

## EXISTS (Code-Verified)

### MCP Server (Model Context Protocol)

- **Transport:** Stateless HTTP — Lambda-compatible (no session persistence required)
- **User Lambda MCP tools:** all `transfers`, `presigned`, and `vault` tagged endpoints (including `read-base64` and vault presigned)
- **Admin Lambda MCP tools:** all `tokens`, `keys`, `vault`, and `users` tagged endpoints
- **12 MCP setup tests** — mount, stateless, operation IDs, tools list
- **Endpoint:** `GET /mcp` on both User Lambda and Admin Lambda
- **Verified milestone M-007:** Claude.ai generated PDF, encrypted it, uploaded via MCP, human decrypted in browser

### Claude as Vault Peer

| Capability | Status | Evidence |
|------------|--------|---------|
| `sgit clone/pull/push/status/init/commit` via bash_tool | **VERIFIED** | Round-trip debrief v0.13.31 |
| Claude reads vault files | **VERIFIED** | `sgit clone` + `cat` workflow confirmed |
| Claude writes vault files | **VERIFIED** | `sgit commit` + `sgit push` workflow confirmed |
| SKILL.md self-bootstrapping | **VERIFIED** | New Claude session cloned vault, read SKILL.md, operated autonomously |
| Vault as async communication channel | **VERIFIED** | Human and Claude exchanged files bidirectionally |
| Per-branch PKI (agent key pair per clone) | **VERIFIED** | Per-branch PKI confirmed working (03/19 case study) |

### sgit CLI (Agentic Operations)

The `sgit-ai` CLI (PyPI) is the primary way agents interact with vaults. Full command list is in `../infra/index.md`. Key agentic-relevant commands:

| Command | Agentic Use |
|---------|------------|
| `sgit clone <vault-key>` | Agent boots by cloning its working vault |
| `sgit push` | Agent commits and publishes work |
| `sgit share` | Agent publishes vault snapshot as share token (known limitation: fails >4MB in Claude Web egress environment) |
| `sgit keygen / sign / verify` | Agent identity and message signing |
| `sgit encrypt / decrypt` | File-level encryption for agent communications |

### Vault Generate Panel (Infographic in Vault UI)

- `vault-generate.js` — LLM infographic generation integrated into vault browser UI
- Loads `sg-llm-events`, `sg-llm-request`, `sg-llm-infographic` from CDN (tools.sgraph.ai)
- OpenRouter API key input with localStorage persistence
- Model selector: Gemini, Claude Haiku, Qwen, Llama, DeepSeek
- Save generated SVG back to vault with custom filename
- Code-verified: commit `b0bf54ea`

### Workspace UI (v0.1.0) — LLM Document Transform

- Full LLM-integrated workspace. See `../ui/index.md` for full details.
- LLM providers: OpenRouter (confirmed) + Ollama (confirmed, Gemma3:4b)
- No LLM traffic through SG/Send server — browser → provider direct
- First LLM call: 4 March 2026

### Scheduled Agent Tasks (Operational)

| Task | Schedule | Status |
|------|----------|--------|
| Daily Librarian run | 9 AM daily | OPERATIONAL (confirmed per doc 192) |
| Daily QA smoke test | 9 AM daily | OPERATIONAL (confirmed per doc 192) |

### Vault-Based Agent Communication

- `team/comms/` structure EXISTS — changelog, QA briefs, questions, plans
- Comms operating model EXISTS — agent-to-agent change classification
- Vault PKI keys for agent identity: `sgit keygen`, `sgit sign`, `sgit verify` — all working

### sg.llm In-Vault LLM Component Suite (P0–P4, 2026-08-20)

The sg.llm component family is shipped as in-vault LLM functionality (ViV loader suite).
Tests verified: `sg_llm_config` (53), `sg_llm` (40), `sg_llm_vault` (17), `sg_llm_chat` (122),
`sg_llm_requests` (29), `sg_llm_vault_log` (35) — ~296 tests in the ViV loader suite.

| Component | Status | Evidence |
|-----------|--------|---------|
| **sg.llm P0-P3 hardening** — egress CSP (content-security policy for LLM requests), consent floors (minimum consent before LLM access), per-app budget (spending ceiling declared before execution), tool scope (capability grant controls on LLM tools) | **EXISTS** | `4999faf`; ViV loader suite tests |
| **sg.llm P4: Spend surfacing** — visible per-session and per-request cost display for in-vault LLM usage; all six re-review defects fixed in P4 | **EXISTS** | `a0caee0`, `15a1c4c`; ViV loader suite |
| **Vault AI chat user guide** — documentation for the in-vault AI chat feature | **EXISTS** | `8c79e8a` |

### Known Constraints

- Claude.ai bash_tool egress proxy blocks direct HTTP to `send.sgraph.ai` unless domain is on allowlist
- Domain allowlist changes only take effect in a new conversation (JWT baked at session start)
- MCP `api_vault_read` returns raw binary which fails UTF-8 decode — `read-base64` solves this
- `sgit share` fails in egress-controlled environments (Claude Web) with vaults >~4MB (doc 275, 04/16); workaround: share vault key directly

---

## Email-FS Protocol Specifications (Spec EXISTS, Implementation PARTIAL)

Published 2026-05-06 by `@Email-FS (architect.spec)`. These are protocol specifications that agents can adopt manually today; automated tooling remains PROPOSED.

| Artifact | Status | Notes |
|----------|--------|-------|
| Email-FS-lite v0.6 — user manual + Issues-FS-lite | **SPEC EXISTS** | `briefs/05/06/email-fs-lite-v0.6.md` (doc 350). Full protocol manual covering vault layout, sessions, messages, commit cadence, task tracking. Manual operation requires no tooling beyond sgit. |
| Email-FS (full) v0.6 — four-document set | **SPEC EXISTS** | Lives in the Email-FS specs vault (external). Covers programmatic operation, per-message signing, ULID filenames, sidecar metadata. |
| Email-FS comparison reference | **SPEC EXISTS** | `briefs/05/06/email-fs-comparison.md` (doc 349). Decision guide: lite for manual chat workflows, full for programmatic/CLI operation. |
| `email-fs` CLI (automates ULID generation, sidecar lifecycle) | **PROPOSED** | Referenced in comparison doc; not yet built |
| Per-message S/MIME cryptographic signing | **PROPOSED** | Requires full Email-FS CLI; lite uses commit-level signing only |
| SMTP bridge (vault email → real email client) | **PROPOSED** | Protocol-compatible (RFC 2822 format) but no bridge built |
| `mail/` folder structure deployed in a SGraph Send comms vault | **PROPOSED** | No comms vault created yet; pending decision OQ-email-2 |

---

## PROPOSED (Not Yet Implemented)

- sg-llm component family (`sg-llm-connection`, `sg-llm-reality`, `sg-llm-request`, `sg-llm-output`, `sg-llm-stats`, `sg-llm-debug`, `sg-llm-bundle`, `sg-llm-bundle-list`, `sg-llm-attachments`) (Section 19)
- Agentic LLM component suite (`sg-tool-definition`, `sg-json-sender`, `sg-json-receiver`, `sg-tool-runner`, `sg-agentic-loop`, `sg-sandbox`) (Section 21)
- Multi-agent chat UI — agent picker, multi-ask mode, debate mode, consolidator (Section 20)
- One-shot feedback loop system — bundle-as-vault, extract, prune, SGit commits per cycle (Section 20)
- One-shot LLM development environment — visual IDE with context/code/preview/LLM zones (Section 19)
- `@agent` code comment pipeline — scan codebase for `@agent` comments, route to issue queues (Section 20)
- Additional scheduled Claude tasks (daily briefing, website stats, OKR tracker, vault cleanup, security scan) (Section 19)
- Task launcher unified shell (doc 319)
- 7 task-focused LLM components (doc 318)
- Intelligence tiers framework — five-tier LLM routing (Tier 1 Frontier → Tier 5 Browser) (Section 23)
- Agentic team setup pack creator (doc 243)
- Vault-driven CI — agent-managed CI triggered by vault commits (Section 31)
- Sequential workflow enforcement via PKI handoffs (Section 16)
- `sgit-ai sync` — pull + push in one operation (Section 19)
- MCP `secrets_create` / `secrets_status` tools (Section 6, DOES NOT EXIST)
- MCP `rooms_create` / `rooms_add_user` / `rooms_revoke_user` tools (Section 6, DOES NOT EXIST)
- Pyodide browser vault (`sgit` via WebAssembly) (Section 16)
- Serverless Playwright API / Lambda (Section 23)

### SG/Sentinel Agent Governance (05/24 briefs — docs 480, 485, Day 70)

**PROPOSED — does not exist yet.** SG/Sentinel batch-2 added two items directly relevant to agentic workflows:

- **P-240: SG/Sentinel in development workflow** — dev agents talk to SG/Sentinel protecting the app they build; rules = attack surface + app definition; AppSec agent reviews rules; controls agent blast radius (rules are analysable); every team (sgit, vault-web, tools) interacts with SG/Sentinel (doc 480, 05/24)
- **P-245: Agent governance as coherent SG/Sentinel capability** — one substrate governs production agents (outbound actions controlled; sequences enforced via control-flow graphs); mediates authenticated agent-to-agent communication via PKI layer; controls development-agent blast radius (rules are analysable); serves surrogates for agent testing; sequenced as a major future surface as agentic systems proliferate (doc 485, 05/24)

### AWS Configuration Risk Engine (07/05 briefs — docs 811–813)

**PROPOSED — does not exist yet.** Three-part technical specification: Python core engine, browser rating layer, and shared ontology/taxonomy.

- **P-811: Python AWS configuration risk engine** — context-not-configuration principle: configuration is a Fact, context makes it a Risk; IAM-first scope; digital twins for every AWS object (IAM policy, S3 bucket, EC2 permission); Node Type Formula classification (computed path-pattern query, not stored label); JSON-only output as handover contract to browser rating layer; run-anywhere (CLI or Pyodide client-side); 10 explicit acceptance criteria defined in brief (brief 1, v0.33.44, 07/05)
- **P-812: Browser risk rating layer** — consumes JSON from Python engine; three computation modes (deterministic formulas, statistical, connected graph), all client-side; cost as per-region blast radius (EC2 vCPU quota per region); "not knowing" as first-class output (confidence band, not point score; wide band triggers get-more-data); agentic union (rate transitive closure of everything reachable, not nominal grant); damage window closed via CloudTrail → EventBridge (not billing lag); accountability graph resolution driving sign-off (brief 2, v0.33.44, 07/05)
- **P-813: AWS IAM risk ontology and taxonomy** — 6-layer Node Type Formula taxonomy bridging AWS IAM into existing risk ontology (not replacing it); 20 directed edge types with named inverses; full worked JSON instance (24 nodes, 18 edges; public regulated S3 + over-broad EC2 role scenario); Python Type_Safe class sketches: `AWS_Config_Node`, `IAM_Principal`, `Grant`, `Authorization_Closure`, `Cost_Ceiling`, `Schema__AWS_Risk_Graph`; crosswalk bridges (declared at crosswalk points, not merges) to CIS AWS Foundations Benchmark, IAM Access Analyzer, AWS Config, OWASP, NIST, RAMM (brief 3, v0.33.44, 07/05)

### Risk Mandate Experience Loop (07/05 brief — doc 816)

**PROPOSED — does not exist yet.**

- **P-816: Risk Mandate experience loop** — three-phase recurring loop: Phase 1 Map (agent → assets → risks, ambiguity carried honestly as data) → Phase 2 Accept (two streams: Stream A Investigate or Stream B Execute; no-deny mechanic, every action is acceptance for an interval) → Recalibrate (both streams return to Phase 1); integrate-first role (drives existing tools and spreadsheets, builds only what is missing); single success metric: risk reduction across successive loop passes (brief 6, v0.33.44, 07/05)

### Agentic Outbound Maturity Model — AOMM (07/27 briefs — docs 868-869)

**PROPOSED — does not exist yet.** Proposed in response to the OpenAI/HuggingFace incident (July 2026). Companion to the plug-profile work from 24 July.

| # | Item | Status |
|---|------|--------|
| P-AOMM-001 | **AOMM framework** — five preconditions (capability, motive, reach, freedom, silence) that must all hold for one organisation's agent to harm another; removing any one breaks the chain | PROPOSED — framework only, no implementation |
| P-AOMM-002 | **AOMM six-level ladder** — Unaware (0) → Enumerated (1) → Bounded (2) → Observed (3) → Contained (4) → Accountable (5); conjunctive and monotone; Level 4 is the plug profile (composes with 24 Jul series) | PROPOSED — framework only |
| P-AOMM-003 | **AOMM level predicates as computed queries** — expressing each level as a graph-native query in the manner of RAMM/OSMM; currently levels are described, not computable | PROPOSED — design only, open item |
| P-AOMM-004 | **AOMM outbound inventory** — Level 1 prerequisite: enumeration of all agents with outbound capability (owner, credentials, reach), assessed against the five preconditions | PROPOSED — not yet done for SGraph's own estate |
| P-AOMM-005 | **Inbound and provider-posture variants** — two sibling registers: inbound (can another org's agents reach you?) and provider posture (can providers distinguish a defender from an attacker?); neither is written yet | PROPOSED — named in brief, not developed |

*Note: the AOMM correction to the lethal trifecta (removing untrusted content as a necessary condition) is grounded in the OpenAI/HuggingFace incident, July 2026, from primary sources. Budget + elapsed time are proposed as first-class containment controls at AOMM Level 2.*

### Agent Enrolment Architecture and Execution Broker (19 Aug 2026 — docs 955–959)

**PROPOSED — does not exist yet.** A three-layer agent authority model addressing
non-human identity for both agents-you-run and agents-you-rent (rented agents running
inside hosted assistants). The append lane transport that the enrolment architecture uses
already EXISTS (server-side, `vault/index.md`); the enrolment workflow, certificate
issuance, mandate objects, and execution broker are all PROPOSED.

| # | Item | Status |
|---|------|--------|
| P-AGT-001 | **Bootstrap-minimal agent enrolment** — agent starts with computation, randomness, and its own generated keypair (nothing else); signs a canonical enrolment request (type, project, public key, requested identity/mandate, nonce, proof of possession); delivers via account-less append lane (append token in body, no access token, blind ACK — transport EXISTS); trusted processor verifies, issues certificate; registry publishes; works for rented agents because no attestation or workload control required | PROPOSED |
| P-AGT-002 | **Identity/mandate separation** — identity (who the key belongs to) and mandate (what the agent may do) as separate signed statements, issued and revoked independently; mandate carries subject, issuer, service, capability, resource, constraints, validity window, usage limit, and signature; a mandate is checkable by a third party (unlike a bearer token); limit: a mandate constrains what an agent may be authorised to do, not what it does within that authority | PROPOSED |
| P-AGT-003 | **Fractal PKI registry** — registries recognising other registries; each registry must declare trust roots or the trust graph is unevaluable; three structural rules from the 2019 keyserver failure: only owner writes own record, revocation is signed append (not deletion), records are size-bounded | PROPOSED |
| P-AGT-004 | **Execution broker (mandate broker)** — agent presents signed mandate + requested action; broker verifies mandate, executes only the permitted operation using internally-held credentials the agent never sees, returns signed receipt; closes the "authorised party misuses legitimately-held authority" gap that capability grants (6 Aug), plan-then-execute (6 Aug), and per-agent keys (16 Aug) each named as their limit; NOT to be named "Service Twin" (collides with "digital twin" = the point where a graph meets reality, established throughout the risk mandate corpus); preferred names: execution broker, mandate broker | PROPOSED |
| P-AGT-005 | **Broker credential concentration mitigation** — execution broker holds all credentials for all tenants; total broker compromise = all credentials usable immediately; self-hosting must be a first-class deployment option (not an enterprise upsell); agent must be able to verify broker identity and refuse unrecognised brokers; credential storage is the product's most critical engineering | PROPOSED |
| P-AGT-006 | **Mandate receipts as evidence chain** — every broker operation produces a signed receipt: agent identity, mandate reference, action performed, timestamp; creates an evidence chain not reliant on mutable platform audit logs; receipts can feed downstream workflow stages directly | PROPOSED |

*Full proposed items: [proposed/index.md](proposed/index.md)*

---

## Sub-files

*Currently all content is in this index. When this file exceeds ~300 lines, sub-files will be created.*
