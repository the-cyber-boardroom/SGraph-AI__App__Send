# AI Agents — Proposed Items Index

**Domain:** ai-agents/proposed/ | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

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

*Full content for all items: `../v0.16.26__what-exists-today.md` (Sections 16–32)*
