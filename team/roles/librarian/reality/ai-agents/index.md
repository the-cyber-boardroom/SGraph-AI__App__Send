# AI Agents — Reality Index

**Domain:** ai-agents/ | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

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

### Known Constraints

- Claude.ai bash_tool egress proxy blocks direct HTTP to `send.sgraph.ai` unless domain is on allowlist
- Domain allowlist changes only take effect in a new conversation (JWT baked at session start)
- MCP `api_vault_read` returns raw binary which fails UTF-8 decode — `read-base64` solves this
- `sgit share` fails in egress-controlled environments (Claude Web) with vaults >~4MB (doc 275, 04/16); workaround: share vault key directly

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
- Agent communication via signed EML messages in vaults (Section 16)
- Sequential workflow enforcement via PKI handoffs (Section 16)
- `sgit-ai sync` — pull + push in one operation (Section 19)
- MCP `secrets_create` / `secrets_status` tools (Section 6, DOES NOT EXIST)
- MCP `rooms_create` / `rooms_add_user` / `rooms_revoke_user` tools (Section 6, DOES NOT EXIST)
- Pyodide browser vault (`sgit` via WebAssembly) (Section 16)
- Serverless Playwright API / Lambda (Section 23)

*Full proposed items: [proposed/index.md](proposed/index.md)*

---

## Sub-files

*Currently all content is in this index. When this file exceeds ~300 lines, sub-files will be created.*
