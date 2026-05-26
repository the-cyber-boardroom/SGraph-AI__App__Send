# 02 — Architecture: topology, the two file systems, the component map

**version** v0.27.80 · **date** 26 May 2026 · **from** Architect · **type** Architecture

## 1. Topology (Decision D1 — everything inside the iframe)

Vault Chat is a **Vault App**: an HTML page loaded by the existing `app-shell` into a blob: iframe, talking to the vault through `window.sg`. Per D1, the chat UI, the LLM/tool components, the **execution center**, and the **budget governor** all run **inside that iframe**. The only things outside it are (a) the parent app-shell that mounts the iframe and serves the bridge, and (b) a **one-time secret injection** at boot (D4).

```
┌──────────────────────────── PARENT (vault UI, trusted) ─────────────────────────────┐
│  app-shell.js                                                                         │
│   • opens vault (VaultDataSource), reads tree                                         │
│   • reads /.vault/secrets/openrouter.key  ──┐  (parent-only; never a VFS path)        │
│   • mounts chat app into blob: iframe        │                                        │
│   • _setupVfsBridgeHandlers (vault I/O)      │  one-time __sgSecrets handshake        │
│                                              ▼                                        │
│  ┌──────────────────────── CHAT IFRAME (the Vault App) ──────────────────────────┐   │
│  │  window.sg  (vfs · sync · auth · ui · app)         ← injected by app-shell      │   │
│  │  ───────────────────────────────────────────────────────────────────────────  │   │
│  │  vault-chat-app                                                                 │   │
│  │   ├─ sg-llm-chat-input / sg-llm-output     (TOOLS, CDN)                          │   │
│  │   ├─ sg-vfs  [memory provider]  ← LLM working set (doc 05)                       │   │
│  │   ├─ ExecutionCenter            ← policy + budget + CONFIRM (BUILD-NEW, doc 04)   │   │
│  │   │    └─ wraps sg-agentic-loop + sg-tool-runner (TOOLS)                         │   │
│  │   ├─ sg-llm-request             (TOOLS) — holds injected key, does HTTP          │   │
│  │   ├─ VaultFlushController       ← memory→vault on flush (BUILD-NEW, doc 05)      │   │
│  │   └─ data-llm-bus               ← event spine (llm:send / llm:tool-calls / …)    │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────────────────┘
        the chat reaches the vault ONLY through window.sg  (read/write/list/sync)
```

**Why this is sound even with the key in-iframe.** "Model-blind" means the *LLM* (the remote model) never receives the key in any prompt, attachment, or tool-result — not that no JS holds it. The key is held in a closure inside `sg-llm-request` and attached only to the outbound `Authorization` header. The tool-runner's `read_file` resolves through `sg-vfs`/`window.sg.vfs`, where `/.vault/**` is excluded (doc 09 §2), so neither the model nor a prompt-injection can name a path that returns the key. The honest residual risk is **in-context third-party JS** (CDN-latest, D2) — recorded as R-supply (doc 09 §4).

**Why not the parent-harness variant (rejected this session):** it would keep the key out of the iframe entirely and proxy LLM/tool HTTP through new `sg.llm.*`/`sg.exec.*` bridge methods. Cleaner isolation, more bridge surface. The project lead chose the cohesive in-iframe build (D1); we honour it and mitigate, rather than re-litigate.

## 2. The two file systems (correction C4)

There are **two distinct things both called "VFS"**. Keeping them separate is the central architectural clarity of this pack.

| | `window.sg.vfs` (the bridge) | `sg-vfs` (the library) |
|---|---|---|
| Where | app-shell injects it into the iframe | loaded into the iframe from `TOOLS/core/sg-vfs` |
| Backs onto | the **vault** (`VaultDataSource.saveFile` → `vault.updateFile`) | pluggable **providers** (memory / indexeddb / layered) + event bus |
| Write semantics | **write-through; one commit per write** | in-memory (or chosen provider); no commit |
| Role in Vault Chat | the **persistence boundary** to the real vault | the **LLM working set** ("the universe the LLM sees") |

The LLM acts on **`sg-vfs` memory** (fast, commit-free, the curated universe). The vault is touched **only** on a flush, **only** through `window.sg`. This is the Memory-FS principle (`.claude/CLAUDE.md`: "application code has no idea which backend is active") applied client-side: the chat, tool-runner, and inspector dispatch on the `sg-vfs` bus and never know whether/when the working set is persisted. Persistence mode (doc 05 §2) is a wiring choice at session construction.

```
  LLM tool: write_file('/work/summary.md', …)
      │
      ▼  (sg-vfs bus: vfs:write-request)
  sg-vfs memory provider           ← lands here, no commit, marks path dirty
      │
      ▼  on flush trigger only (turn-end / explicit / zip)
  VaultFlushController.flush(msg)  ← reads dirty paths from memory
      │
      ▼  window.sg.vfs.writeBatch(items, {message})   ← EXTEND (doc 03 §3)
  app-shell handler → vault.addFiles(items)           ← ONE commit
```

## 3. Component map (what each piece is, and its status)

| Layer | Component | Source | Status |
|---|---|---|---|
| Shell | `app-shell` mounts the chat app in a blob: iframe | `VAULT/.../app-shell/app-shell.js` | **REUSE** (+ tiny EXTEND, doc 03) |
| Shell | the chat is registered as a Vault App (`.vault/app.json`) | app.json schema | **REUSE** |
| Bridge | `window.sg.{vfs,sync,auth,ui,app}` | injected by app-shell | **REUSE** + **EXTEND** (`writeBatch`, `secrets` handshake, `delete`) |
| Chat | `vault-chat-app` (orchestrator), `vault-chat-pane`, transcript | new | **BUILD-NEW** (extends `VaultComponent`) |
| Chat | input/output/turn rendering | `TOOLS/llm/sg-llm-chat-input`, `sg-llm-output` | **REUSE** (CDN) |
| Chat | request + streaming + cost + provider builders | `TOOLS/llm/sg-llm-request` (v0.1.2) | **REUSE** (CDN) |
| Chat | event spine | `TOOLS/llm/sg-llm-events` + `data-llm-bus` | **REUSE** (the `vault-generate` pattern) |
| Tools | tool definitions + enable/disable/export | `TOOLS/agentic/sg-tool-definition` | **REUSE** |
| Tools | tool execution (built-ins + custom) | `TOOLS/agentic/sg-tool-runner` | **REUSE** |
| Tools | the `tool-calls → execute → results → resend` loop | `TOOLS/agentic/sg-agentic-loop` (or `sg-llm-request`'s loop) | **REUSE** |
| Control | **ExecutionCenter** (policy compile, CONFIRM, DRY_RUN, budget) | new | **BUILD-NEW** (doc 04) |
| Memory | `sg-vfs` memory working set | `TOOLS/core/sg-vfs` | **REUSE** |
| Memory | **VaultFlushController** (modes, dirty-set, flush, zip) | new | **BUILD-NEW** (doc 05) |
| Memory | self-prune tool (`consolidate_memory`) | new tool def | **BUILD-NEW** (doc 05 §4) |
| Inspect | context-layers inspector | new view over existing buses | **BUILD-NEW** (doc 05 §5) |
| Inspect | bridge/tool/LLM log | `app-debug-bridge-log.js` | **REUSE** + **EXTEND** (tool/llm rows) |
| Cognition | sidecars / consensus / knowledge-graph | new, on the same buses | **TRACK-B** (doc 06) |

## 4. The agentic loop (reused, not built)

The proven flow (already shipped in `sg-llm-request` / `sg-agentic-loop`):

```
compile tools[] (ExecutionCenter, from available && mode≠OFF)
  → llm:send {messages, tools}
  → llm:tool-calls [{name,args}]
  → for each: ExecutionCenter.execute(name,args)         ← NEW wrapper applies policy
        AUTO    → run via sg-tool-runner
        CONFIRM → emit approval event → UI inline card → run/deny
        DRY_RUN → preview only
  → llm:tool-result (per call)
  → llm:tool-results-complete
  → resend (loop) until no tool calls
```

The **only new code in this path** is `ExecutionCenter.execute()` (the gate) and the tool-list compilation (doc 04). Everything else is the existing loop.

## 5. Vault-awareness (how the chat knows what's in the vault)

The dev brief's "vault-awareness" is satisfied without dumping the vault into the prompt:
1. At session start the chat calls `sg.vfs.list('/')` (and lazily deeper) to build a **tree manifest** — names/sizes/types only, cheap, no content.
2. The manifest is summarised into the system prompt ("the vault contains …; use `read_file` to load what you need").
3. Files are pulled into the `sg-vfs` working set **on demand** via `read_file` (which the bridge fulfils from the vault). This is the briefs' "curated universe": only what is read in is visible to the model.
4. **Fractal scope** (arch brief): the session is constructed with a *root* (`/`, a folder, or a single file). The manifest + `read_file` are scoped to that root. Scope is a session-construction parameter, not new machinery.

## 6. Standalone vs in-vault (one app, two hosts)

The chat app is **decoupled** (dev-brief AC1): it runs against a **`sg-vfs` memory provider with a mock `window.sg`** on a long standalone test page (Phase 0), and identically against the real bridge when mounted as a Vault App (Phase 1). The app never branches on host — it always talks to `window.sg` + `sg-vfs`; the standalone page just supplies a fake `window.sg`. This is the same decoupling `app-shell` apps already enjoy.

---

*CC BY 4.0.*
