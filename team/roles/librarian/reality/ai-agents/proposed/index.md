# AI Agents — Proposed Items Index

**Domain:** ai-agents/proposed/ | **Last updated:** 2026-05-20 | **Maintained by:** Librarian (daily run)

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

## Vault App CI Pipeline (05/16 brief — doc 419)

All items below are PROPOSED — does not exist yet.

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| P-136 | Vault app CI pipeline: 8-stage (commit → unit tests → vault inventory → per-vault tests → build → staging deploy → browser-automation → manual gate) | doc 419 |
| P-137 | Vault inventory as manager vault: registry of registered vaults with test config, fixture pointers, notification preferences | doc 419 |
| P-138 | Trigger ephemeral compute (Fargate/container hosts) from CI for isolated test environments (multi-region, browser-automation, load tests) | doc 419 |
| P-139 | CI cost metering through pre-auth substrate: per-vault and aggregate cost visible; customer vaults billed to their balance | doc 419 |

## Nova + AgentCore POC (05/16 brief — doc 420)

All items below are PROPOSED — does not exist yet.

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| P-140 | FastAPI service with `/nova/invoke` (Nova Micro/Lite/Pro/Premier) and `/agentcore/invoke` (Browser, Code Interpreter, memory) endpoints | doc 420 |
| P-141 | Mini UI for Nova/AgentCore experimentation: model selector, prompt textarea, cost/latency display, session history | doc 420 |
| P-142 | Nova Act SDK integration for browser automation experiments against vault demos | doc 420 |
| P-143 | LLM-validated qualitative tests as a fifth vault test layer: Nova prompt over vault content → JSON score + issue list + recommendations | doc 420 |

## AppSec Mini-Tools (05/16 brief — doc 423)

All items below are PROPOSED — does not exist yet.

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| P-155 | Threat modelling mini-tool: StrideGPT integration (STRIDE + OWASP LLM Top 10 + multi-modal); two modes (pure client-side; ephemeral compute-backed) | doc 423 |
| P-156 | Vault schema for threat modelling artifacts: system descriptions, threat lists (STRIDE), attack trees, DREAD scores, mitigations, Gherkin tests | doc 423 |
| P-157 | AppSec mini-tools catalogue: SBOM analysis (syft/cdxgen), dependency scanning (trivy/grype), secrets detection (gitleaks), OWASP assessment, compliance evidence (8 tools mapped) | doc 423 |
| P-158 | GitHub-driven vault pattern for source-code analysis: vault clones repo, runs analysis, commits results back; triggers on upstream changes | doc 423 |
| P-159 | "Security manager vault" holding many specialised AppSec vaults; findings cross-reference across vault boundaries | doc 423 |
