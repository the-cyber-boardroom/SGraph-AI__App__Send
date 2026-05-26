# 01 — Brief Reconciliation: what was asked vs what ships

**version** v0.27.80 · **date** 26 May 2026 · **from** Architect · **type** Reconciliation + AC source-of-truth

This doc reconciles the four upstream documents against code, so the rest of the pack builds on facts, not aspirations.

## 1. The four upstream documents

| Doc | Type | Role here |
|---|---|---|
| `v0.27.62__dev-brief__talk-to-the-vault-chat-tool-calling.md` | Originating feature | The minimum: chat window + vault-awareness + tool-calling + read-write + right-hand pane + user's key |
| `v0.27.64__arch-brief__vault-chat-architecture-vfs-iframe.md` | Architecture | iframe bridge, two file systems (vault + VFS), tools control model, context layers, fractal scope, next-chat, keystone |
| `v0.27.64__arch-brief__vault-chat-prompt-context-token-management.md` | Architecture | Continuous token mgmt, Librarian patterns, self-prune, every-message-a-file, sidecars, consensus, knowledge graph, budget, keys-in-vault, zip-to-vault |
| `v0.27.79__arch-review__...-layered-vfs-and-execution-center-contract.md` | Interface contract | The synthesis: persistence modes, execution-center policies, budget governor, keys-in-vault, injection floor, Track A/B split, phasing |

The contract is the closest to this pack; doc 00 lists the seven corrections (C1–C7) where it diverges from code.

## 2. Claims verified against code (✓ true / ✗ false / ◐ partly)

| Claim (source) | Verdict | Evidence |
|---|---|---|
| `window.sg` bridge exists (postMessage) | ✓ | `app-shell.js:1018-1365` (`_buildVfsBridgeScript`, `_setupVfsBridgeHandlers`) |
| Bridge surface is `{vfs,git,auth,ui}` | ◐ | Real: `sg.vfs` (read/readText/write/list), `sg.sync` (status/check/push/pull/refresh), `sg.auth` (hasKey/setKey/check/clear), `sg.ui` (message/dismiss), `sg.app` (selfPath/writable/vaultName/…), `sg.loadCss/loadJs`. `sg.git` is a **deprecated alias** to `sg.sync`. |
| Bridge-log visualiser exists, icon-codes calls | ✓ | `app-debug-bridge-log.js` — `📖 vfs.read · ✏️ vfs.write · 📂 vfs.list · → nav · 💬 ui.message · 🔑 auth`. Driven by `window._appDebug.bridgeCalls`. **No `tool`/`llm` rows yet** → EXTEND (doc 04 §3). |
| `sg-vfs` providers (memory/indexeddb/layered/base) + bus exist | ✓ (in `__Tools`) | `TOOLS/core/sg-vfs/...` + `components/vfs/...`. **Not loaded by `__Send` today** → wire in. |
| `sg-tool-runner` built-ins exist | ✓ (in `__Tools`) | `TOOLS/components/agentic/sg-tool-runner/...` + `sg-tool-definition`, `sg-agentic-loop`, `sg-json-sender/receiver`, `sg-local-bridge`, `sg-python-repl`. |
| `sg-llm-request` agentic loop + per-call cost | ✓ (in `__Tools`) | `TOOLS/components/llm/sg-llm-request/...`; `__Send` loads **v0.1.2**. Cost surfaced on completion event. |
| `vault-generate` makes infographics from a vault file, saves back | ✓ | `vault-generate.js:180-252` — `data-llm-bus` `llm:send` → SVG → `_vault.addFile`. |
| Vault file-ops: content-addressed commits, push/pull/merge | ✓ | `sg-vault--file-ops.js`, `sg-vault-commit.js` (`createCommit`, `createTree`), `sg-vault--sync.js` (named-ref/clone-ref, ff-only push/pull, file-level merge). |
| Execution center exists "as Playwright Python TUI" | ◐ | Out of repo; **but the JS pieces it would be ported to already exist** (C1). We don't port Python; we wrap the JS loop. |
| Vault VFS provider exists | ✗ | Not needed as a shared provider — see C3/C4. We use the bridge + a flush controller. |
| Iframe is sandboxed/restricted | ◐ | blob: object-URL iframe, **no `sandbox=` attr** (C7). |
| OpenRouter key lives in the vault | ✗ (today) | Today: parent `localStorage`. D4 moves it to a vault reserved path with parent-boot injection. |

## 3. Acceptance-criteria source-of-truth

Both briefs' ACs are the contract this pack must satisfy. Full phase mapping is in doc 10; here is the consolidated list so reviewers have one table.

**Architecture brief (vfs-iframe) AC1–AC10:** standalone iframe app · vault via `window.sg` · every session an iframe · tools control model (auto/ask/controlled + per-task availability) · VFS as curated working memory · context layers inspectable · optional VFS↔vault sync · fractal scope + next-chat · Vault Chat = Vault App sibling · plan agreed.

**Token-management brief AC1–AC11:** continuous baked-in token mgmt · Librarian patterns · LLM aware of env+budget · lossless self-prune · every message/response a VFS file · sidecars (curation/extraction/history/security) · multi-LLM consensus · semantic knowledge graph · end-of-chat zip-to-vault · budget enforced (incl. memory-work) · execution keys in vault.

**Dev brief AC1–AC7:** chat window in vault UI · vault-aware · tool-calling visible · read-write scoped to the self-contained vault · infographic + file tools wired · right-hand pane · user's own OpenRouter key.

## 4. The one override carried forward

The contract overrode the briefs' literal "every message a file, every file a commit" (which defaults to many commits) in favour of **commit-free by default** (D5). The project lead flagged this for confirmation; this pack treats it as **confirmed** (the briefs themselves call sync *optional*). Every message is still a **file** (in the memory VFS); it just isn't a **commit** until a flush.

---

*CC BY 4.0.*
