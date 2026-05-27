# 08 — Reuse Map: `__Send` + `__Tools` vs Build-New

**version** v0.27.80 · **date** 26 May 2026 · **from** Architect · **type** Reuse map
**source** code-verified 26 May 2026. Legend: **REUSE** (import/load unchanged) · **EXTEND** (small additive change) · **BUILD-NEW**.

> **Path roots.** `VAULT/` = `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/`. `TOOLS/` = `https://dev.tools.sgraph.ai/components/…` (and `core/…`), loaded as ES modules exactly as `vault-generate` loads `sg-llm-*` today (D2: CDN-latest).

The headline: **the chat, the tool loop, tool execution against a VFS, the LLM provider/streaming/cost, the iframe shell, the bridge, the vault commit/sync, and the visualiser all already exist.** Track A is **four real builds** — the ExecutionCenter (policy/budget/CONFIRM), the VaultFlushController, the `sg-vfs` working-set wiring, and the chat shell — plus four tiny bridge EXTENSIONs.

## A. Shell, bridge, vault I/O — REUSE / small EXTEND (`__Send`)

| Building block | Verb | Path | Gives you |
|---|---|---|---|
| `app-shell` mount in blob: iframe; app.json; resource inject; auth intercept | **REUSE** | `VAULT/_common/js/components/app-shell/app-shell.js` (`_mountApp` ~L697; resources L670-693; auth L603-666) | The whole iframe host for the chat-as-Vault-App |
| `window.sg.{vfs,sync,auth,ui,app}` + protocol | **REUSE** | `app-shell.js:1018-1365` | Vault read/list/write/sync/auth from the iframe |
| `__sgSecrets` boot push + `/.vault/**` exclusion | **EXTEND** | `app-shell.js` `_mountApp` + `_setupVfsBridgeHandlers` + img patch L1128-1178 | D4 key injection; reserved-prefix invisibility |
| `sg.vfs.writeBatch` / `sg.vfs.delete` | **EXTEND** | `app-shell.js` (+ `_buildVfsBridgeScript`); backed by `sg-vault--file-ops.js:37-73 addFiles`, `:110-116 removeFile` | Flush = **one** commit |
| `tool.*` / `llm.*` log rows + icons | **EXTEND** | `app-debug-bridge-log.js:30-36` | Visibility (briefs) |
| Vault file-ops / commit / tree / sync | **REUSE** (parent-side, via bridge) | `sg-vault--file-ops.js`, `sg-vault-commit.js`, `sg-vault--folder-ops.js`, `sg-vault--sync.js` | Content-addressed commits, ff push/pull, lazy subtree |
| `VaultDataSource` (getTree/getFileBytes/saveFile/writable) | **REUSE** | `VAULT/_common/js/adapters/vault-data-source.js` | What the bridge handlers already call |
| `VaultComponent` base + `design-tokens.css` | **REUSE** | `VAULT/_common/js/base/vault-component.js`, `VAULT/_common/css/design-tokens.css` | All new chat components extend this |
| `messages-service` (toasts) | **REUSE** | `VAULT/_common/js/services/messages-service.js` | Budget-refused / error surfacing |
| `vault-generate` LLM-over-`data-llm-bus` + OpenRouter | **REUSE as pattern** | `vault-generate.js:19-25,180-252` | The exact `llm:send`→result→`addFile` precedent; `create_infographic` reuses this path |

## B. Chat, tools, LLM, VFS — REUSE (`__Tools`, CDN)

| Building block | Verb | Path (`TOOLS/`) | Gives you |
|---|---|---|---|
| LLM request + streaming + cost + OpenAI/Anthropic builders | **REUSE** | `llm/sg-llm-request/v0/v0.1/v0.1.2/` (bump deliberately) | The HTTP/SSE call; per-call `cost`; holds the injected key |
| Chat input / output / events | **REUSE** | `llm/sg-llm-chat-input`, `sg-llm-output`, `sg-llm-events/v0/v0.1/v0.1.0/` | Turn UI + the `data-llm-bus` spine |
| Response inspector / debug / stats | **REUSE** | `llm/sg-llm-response-inspector`, `sg-llm-debug`, `sg-llm-stats` | Inspector + log detail |
| Tool definitions (enable/disable, custom, export/import) | **REUSE** | `agentic/sg-tool-definition/v0/v0.1/` | Policy-driven `tools[]`; custom defs for `create_infographic`/`flush_memory` |
| Tool runner (built-ins + custom execution) | **REUSE** | `agentic/sg-tool-runner/v0/v0.1/` | `read_file/write_file/list_folder/delete_file` against the working set |
| Agentic loop (`tool-calls→execute→results→resend`) | **REUSE** | `agentic/sg-agentic-loop/v0/v0.1/v0.1.0/` (or `sg-llm-request`'s loop) | The loop the ExecutionCenter gates |
| VFS providers (memory/indexeddb/layered/base) + bus + events | **REUSE** | `core/sg-vfs/v0/v0.1/v0.1.0/` (+ `components/vfs/`) | The working set + the mode-agnostic bus |
| Infographic component | **REUSE** | `components/infographic/` (already used via `sg-llm-infographic v0.1.0`) | `create_infographic` rendering |
| OpenRouter integration | **REUSE** | `components/openrouter/` | Provider/model config |

> **Anti-coupling.** `run_code`/`sg-python-repl` (`agentic/sg-python-repl`) is **NOT registered** in Track A (D6). `sg-local-bridge` (a different bridge concept) is **not** used — the vault bridge is `window.sg`.

## C. BUILD-NEW (`__Send`)

### C.1 Chat app — `VAULT/en-gb/vault/chat/` + `VAULT/_common/js/components/vault-chat/`
| File | Role |
|---|---|
| `vault/chat/index.html` + `.vault/app.json` | The Vault App entry (loads `TOOLS/` modules as `vault-generate`'s index does) |
| `vault-chat-app.js` | Orchestrator: wires `sg-vfs` working set, `data-llm-bus`, ExecutionCenter, FlushController; consumes `__sgSecrets`; builds the vault manifest |
| `vault-chat-pane.js` | The pane/transcript + the 4 chips (layers/tools/log/budget); extends `VaultComponent` |
| `vault-chat-inspector.js` | Context-layers inspector (doc 05 §5) — read-only over the buses |

### C.2 Control + memory — `VAULT/_common/js/lib/vault-chat/`
| File | Role |
|---|---|
| `execution-center.js` | `compileTools`, `execute` (policy/CONFIRM/DRY_RUN), `preflight`/`ledger` budget governor, log emission (doc 04) |
| `tool-policies.js` | Default policy table + loadouts + read-only degrade (doc 04 §1) |
| `vault-flush-controller.js` | Modes, dirty-set, `flush`, `snapshotZip` (doc 05 §3) |
| `tools/consolidate-memory.js` | Self-prune custom tool (doc 05 §4) |
| `tools/create-infographic.js` | Custom tool wrapping the `vault-generate` bus path (doc 04 §5) |
| `tools/flush-memory.js` | Custom tool → FlushController |
| `chat-session.js` | Session construction: scope root, mode, loadout, system-prompt assembly, manifest |

### C.3 Standalone harness — `VAULT/en-gb/vault/chat/test/`
| File | Role |
|---|---|
| `index.html` + `mock-sg.js` | Long test page + in-memory mock `window.sg` (doc 07 §4) |

### C.4 Track-B (Phase 6, BUILD-NEW) — `VAULT/_common/js/lib/vault-chat/cognition/`
`sidecar-bus.js`, `sidecars/{injection,extraction,curation,consolidation}.js`, `consensus.js`, `graph/{store,index}.js` (doc 06).

## D. What the upstream contract assumed that does NOT exist here

| Upstream assumption | Reality in `__Send`/`__Tools` | Instead |
|---|---|---|
| Build a "vault VFS provider" | The bridge already maps VFS↔vault; a separate provider is redundant | Working set = `sg-vfs` memory; vault via `window.sg` (doc 02 §2) |
| Build "write-back mode into the layered provider" | Layered is write-through (correct elsewhere); memory working set sidesteps it | `VaultFlushController` (doc 05 §3) |
| "Port the Python TUI execution center" | The JS agentic loop + tool-runner already exist | Wrap them with the ExecutionCenter (doc 04) |
| Harness calls `vault.createCommit({message})` | Iframe can't reach file-ops; bridge commits per write | `sg.vfs.writeBatch({message})` EXTENSION (doc 03 §3) |
| Key held in the parent, model-blind | D1 puts execution in-iframe | Parent reads + injects key at boot; `/.vault/**` excluded (doc 03 §2/§4) |
| `sg-llm-request v0.1.6` | `__Send` loads v0.1.2 | Pin actual; bump deliberately |

---

*CC BY 4.0.*
