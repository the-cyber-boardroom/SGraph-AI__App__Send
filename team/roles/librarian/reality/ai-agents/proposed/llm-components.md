# AI Agents — Proposed: LLM Components and Tooling

**Domain:** ai-agents/proposed/llm-components | **Last updated:** 2026-06-28 | **Maintained by:** Librarian (B-003)
**Parent index:** [`index.md`](index.md)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

Full content for early items (LLM component family, tool execution, multi-agent): `../v0.16.26__what-exists-today.md` (sections noted).

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

## Developer Experience

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| One-shot LLM development environment | Visual IDE: context editor, code editor, live preview iframe, LLM panel | Section 19 |
| sg-git-graph Web Component | Interactive commit graph viewer; LLM thread visualisation mode | Section 20 |
| Intelligence tiers framework | Five-tier model (Frontier→Browser) for cost-optimised LLM routing | Section 23 |
| Pyodide browser vault (sgit via WASM) | Run sgit operations entirely in browser without CLI install | Section 16 |

---

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

*Full content: `../v0.16.26__what-exists-today.md` (Sections 16–32)*

---

## Nova + AgentCore POC (05/16 briefs — doc 420)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-142 | FastAPI service with Nova model invocations | Micro / Lite / Pro / Premier endpoints; mini UI with model selector, prompt, result, cost, history | doc 420 |
| P-143 | FastAPI service with AgentCore agent invocations | Configurable tools (Browser, Code Interpreter); session management; memory | doc 420 |
| P-144 | Nova Act SDK integration for browser automation | Nova Act browser sessions against vault demo URLs; >90% accuracy on UI interaction tasks | doc 420 |
| P-145 | LLM-validated qualitative tests (fifth test layer) | Nova-powered "is this vault OK?" beyond structural assertions; complements unit/integration/QA/browser | doc 420 |
| P-146 | Per-invocation cost tracking log | Every LLM invocation: tokens in/out, cost estimate, latency, raw API response logged | doc 420 |
