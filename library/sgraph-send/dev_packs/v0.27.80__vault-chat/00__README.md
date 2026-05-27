# 00 — README: Vault Chat Dev Pack (Track A + Track B, code-grounded)

**version** v0.27.80
**date** 26 May 2026
**from** Architect (Explorer team)
**to** Dev (lead), AppSec, Product, Conductor, the coding session
**type** Dev pack — architecture → interfaces → implementation → security → phases
**status** PROPOSED — nothing in this pack exists in `SGraph-AI__App__Send` yet. Cited code is real (paths verified 26 May 2026). See the reality document at `team/roles/librarian/reality/` — there is **no** "Vault Chat" entry there; this pack proposes it.

> **Reality check.** Vault Chat does **not** exist. What exists and is reused is the **Vault App / app-shell iframe + `window.sg` bridge** (`sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/`), the **vault file-ops/commit/sync** library, **`vault-generate`** (LLM-over-`data-llm-bus`), and the **SGraph-AI__Tools** component library served from `tools.sgraph.ai` (`sg-vfs`, `sg-agentic-loop`, `sg-tool-runner`, `sg-tool-definition`, `sg-llm-*`). Everything else here is BUILD-NEW.

---

## Why this pack exists

A prior architecture contract (`v0.27.79__arch-review__vault-chat-layered-vfs-and-execution-center-contract.md`) and two arch briefs + one dev brief (all attached) framed Vault Chat. Those were written **without access to the `__Send` vault-UI code**, so several "must build" items are actually "reuse," and several interface claims don't match the shipped bridge. This pack **re-grounds the contract against real code** and turns it into a build-ready specification for both tracks.

The project lead ratified **"everything in the two briefs as one programme."** This pack honours that: Track A (substrate) is specified to build-ready depth; Track B (cognition) is specified in full at the design level, building on Track A's seams.

---

## What changed from the upstream contract (the corrections that matter)

| # | Upstream contract said | Code reality | This pack |
|---|---|---|---|
| C1 | "Execution center as a JS harness — DOES NOT EXIST — build (port the Python TUI)" | `sg-agentic-loop`, `sg-tool-runner`, `sg-tool-definition` **already exist in JS** in `__Tools`; `sg-llm-request` already runs the `llm:tool-calls → results → resend` loop | **REUSE** the JS agentic loop + tool-runner; BUILD-NEW only the **policy + budget + CONFIRM** layer that wraps them (doc 04) |
| C2 | One `window.sg.{vfs,git,auth,ui}` surface; harness calls `vault.createCommit({message})` directly | Real surface is `sg.vfs / sg.sync / sg.auth / sg.ui` (`git` is a deprecated alias); **every `sg.vfs.write` is its own commit**; iframe code **cannot** call vault file-ops directly — only via the bridge | The flush controller drives the bridge; we **EXTEND the bridge** with a batch/commit-with-message method (doc 03) so a flush is **one** commit, not N |
| C3 | "layered provider is write-through" → build a deferred-flush mode into the shared provider | True, but irrelevant once the working set is a **memory** provider: dirty paths never touch the vault until flush | No change to the shared `LayeredProvider`. A thin **`VaultFlushController`** in the chat app coalesces memory→vault writes (doc 05) |
| C4 | Two VFS concepts treated as one | There are **two**: `window.sg.vfs` (bridge→vault, write-through) and `sg-vfs` (in-context, pluggable providers + bus). | The LLM working set is **`sg-vfs` memory inside the iframe**; the vault is reached **only** through `window.sg` (doc 02 §2) |
| C5 | Key "harness-held, model-blind" in the parent | Today the OpenRouter key is in **parent `localStorage`**; the iframe reaches the vault only via the bridge | Topology decision (below) is **everything-in-iframe**, so the **parent reads the key and injects it into the iframe at boot**; `/.vault/**` is excluded from the iframe VFS (doc 09 §2) |
| C6 | `sg-llm-request v0.1.6` | `__Send` currently loads **`sg-llm-request v0.1.2`**, `sg-llm-events v0.1.0`, `sg-llm-infographic v0.1.0` from `dev.tools.sgraph.ai` | Pin against **actual** available versions; bump deliberately (doc 08) |
| C7 | "sandboxed iframe" with tight restrictions | App-shell uses a **blob: object-URL iframe with NO `sandbox=` attribute**; isolation is blob-origin + `e.source` checks | Documented honestly; sandbox hardening is a named risk + later phase (doc 09 §5) |

---

## Decisions settled this session (project lead, 26 May 2026)

| # | Topic | Decision | Consequence |
|---|---|---|---|
| D1 | **Topology** | **Everything inside the iframe** — chat UI, execution center, budget governor, and key usage all live in the chat iframe (the Vault App sibling). | Minimal new bridge surface; key must be *injected* at boot (D4); CDN supply-chain risk is in-context (D2 + doc 09). |
| D2 | **Tools dependency** | **CDN latest** from `dev.tools.sgraph.ai` (status quo, as `vault-generate` does). | Least work. Supply-chain risk recorded as **R-supply** (doc 09 §4); pin/SRI proposed as a later hardening phase (Phase 8). |
| D3 | **Pack scope** | **Full A + B specified now.** | This pack covers sidecars, multi-LLM consensus, and the semantic knowledge graph (doc 06) as well as the substrate. |
| D4 | **Key storage** | **Vault reserved path** `/.vault/secrets/openrouter.key`. | The **parent** reads it at iframe-boot and injects it via a one-time handshake; `/.vault/**` is excluded from the iframe-facing VFS so the tool-runner can never `read_file` it (doc 03 §4, doc 09 §2). |
| D5 | **Persistence default** | `ephemeral` (memory only, commit-free) is the default; `snapshot` (zip→1 commit) and `synced` (deferred-flush) are opt-in. | Carried from the contract §2.2; confirmed correct against the write-through bridge reality. |
| D6 | **`run_code`** | **Not registered** in Track A (stronger than `OFF`). | The tool cannot be enabled by any UI or injection because it isn't in the registry. Revisit in a sandbox-gated phase. |

---

## Reading order

| Doc | Read for |
|---|---|
| **00 — README** (this) | The map, the corrections, the decisions, status |
| **01 — Brief reconciliation** | What the briefs/contract asked vs what code says; the AC source-of-truth |
| **02 — Architecture** | Topology, the two-VFS model, component map, the agentic loop, data-llm-bus |
| **03 — Bridge contract** | The exact `window.sg` surface we depend on + the small EXTENSIONS we add |
| **04 — Execution center** | Tool policies, tool-list compilation, CONFIRM UI, the budget governor |
| **05 — VFS, persistence & memory** | sg-vfs memory working set, ephemeral/snapshot/synced, flush controller, every-message-as-file, self-prune, context-layers inspector |
| **06 — Cognition (Track B)** | Sidecars, multi-LLM consensus, semantic knowledge graph, facts/hypotheses/evidence |
| **07 — UX, flows & mockups** | User journey + turn-lifecycle / key-at-boot / persistence / consensus **flow diagrams**, plus mockups of every surface and state (pane, empty/loading, CONFIRM incl. budget-refused & read-only, fenced untrusted content, tools/loadout, inspector tabs, standalone harness, next-chat, created-apps) |
| **08 — Reuse map** | REUSE / EXTEND / BUILD-NEW against `__Send` and `__Tools`, with real paths |
| **09 — Security review** | Keys, reserved-prefix exclusion, prompt-injection fencing, CDN supply-chain, threat model |
| **10 — Phases & acceptance** | Phase plan with gates; both briefs' ACs mapped |
| **11 — Briefing pack** | Architect entry point: the *why* + the narrative + the settled decisions. Read first if you want the story before the detail. |
| **12 — Implementation plan** | Dev build hand-off: house rules, data contracts, module signatures, bridge extensions, per-phase task lists + DoD, test plan, files-touched. |

> **One location.** The whole pack — including the architect briefing pack (11) and the dev implementation plan (12) — lives in this folder. (Per the team convention these would normally sit in `team/roles/architect/reviews/` and `team/roles/dev/reviews/`; consolidated here at the project lead's request.)

---

## Where the substance lives (code roots)

- **Vault UI / app-shell / bridge / file-ops:** `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/` — abbreviated **`VAULT/`** below.
  - app-shell + bridge: `VAULT/_common/js/components/app-shell/app-shell.js`
  - bridge log: `VAULT/_common/js/components/app-shell/app-debug-bridge-log.js`
  - file-ops / commit / sync: `VAULT/_common/js/lib/sg-vault/{sg-vault--file-ops.js,sg-vault--folder-ops.js,sg-vault-commit.js,sg-vault--sync.js}`
  - data source adapter: `VAULT/_common/js/adapters/vault-data-source.js`
  - LLM-over-bus precedent: `VAULT/_common/js/components/vault-generate/vault-generate.js`
  - component base: `VAULT/_common/js/base/vault-component.js`
- **Tools components (CDN):** `https://dev.tools.sgraph.ai/components/{llm,agentic,vfs}/...` and `core/sg-vfs/...` — abbreviated **`TOOLS/`**.
- **New chat app:** a new Vault App at `VAULT/en-gb/vault/chat/` + components under `VAULT/_common/js/components/vault-chat/` (BUILD-NEW; doc 08 §E).

---

## Status legend used throughout

**REUSE** (import/load unchanged) · **EXTEND** (small additive change to shipped code) · **BUILD-NEW** (does not exist) · **TRACK-B** (designed now, built after A's substrate).

---

*This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).*
