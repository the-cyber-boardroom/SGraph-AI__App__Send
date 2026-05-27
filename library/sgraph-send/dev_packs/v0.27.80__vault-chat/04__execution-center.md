# 04 — Execution Center: policy, tool-list compilation, CONFIRM, the budget governor

**version** v0.27.80 · **date** 26 May 2026 · **from** Architect · **type** Component spec (BUILD-NEW)

The ExecutionCenter is the single choke point: **every** tool call and **every** LLM call passes through it. It wraps the reused `sg-agentic-loop` + `sg-tool-runner` (C1) and adds the three things they don't have: per-tool **policy**, harness-enforced **budget**, and the **CONFIRM** UX. It runs **inside the iframe** (D1).

## 1. Tool policy

```js
ToolPolicy = {
  name:      'write_file',
  mode:      'AUTO' | 'CONFIRM' | 'DRY_RUN' | 'OFF',
  tier:      'READ' | 'WRITE' | 'DESTRUCTIVE' | 'COSTLY',
  available: boolean,    // per-task: if false the tool is NOT compiled into tools[] at all
}
```

**Crucial semantic (from the contract, kept):** an unavailable tool is **invisible to the model**, not refused at runtime. `compileTools()` emits the `tools[]` array sent in `llm:send` from `available && mode!=='OFF'` policies only. The model cannot be jailbroken into calling a tool it was never offered. "Approve-always" flips that tool's **session** policy `CONFIRM→AUTO` (never persisted to the vault, never settable by a tool — doc 09 §3 item 4).

**Default policy table (Track A):**

| Tool | tier | default mode | notes |
|---|---|---|---|
| `list_folder`, `read_file`, `stat`, `exists` | READ | **AUTO** | no blast radius (working set + vault-via-bridge) |
| `write_file`, `create_folder`, `rename` | WRITE | **CONFIRM** | mutates the working set; cheap to confirm |
| `delete_file` | DESTRUCTIVE | **CONFIRM** | always |
| `create_infographic` | COSTLY | **CONFIRM** | spends money (~$0.03–0.10/img) — reuses `vault-generate`'s `data-llm-bus` path |
| `flush_memory` (vault commit) | WRITE | **CONFIRM** in `synced`, **AUTO** in `ephemeral` | a commit is a real side effect |
| `consolidate_memory` (self-prune) | WRITE | **AUTO** | writes only into the working set (doc 05 §4) |
| `run_code` | — | **NOT REGISTERED** (D6) | absent from the registry in Track A |

**Degrade rule:** when `sg.app.writable === false` (read-only vault open), all WRITE/DESTRUCTIVE/`flush_memory` policies are forced `available=false`. The chat still works as read-only.

**Per-task availability** (briefs' "every capability is a tool, available or not"): a session is constructed with a **loadout** — a named set of `{tool: {available, mode}}` overrides. Fractal scope and task type pick a loadout (e.g. "read-only review", "edit + infographics", "memory-curation"). Loadouts are UI/config, never model-settable.

## 2. Budget governor — harness-enforced, prompt-advisory

The token-management brief is explicit that an LLM told to manage its own budget can loop and overspend. So:

- **Hard cap lives in the ExecutionCenter, not the model.** Before every `llm:send` and every COSTLY tool, run a **pre-flight estimate** against a running **session ledger**. If `projected > remaining`, **refuse** and surface to the user (`sg.ui.message(..., 'warning')` + an inline ledger row). The model cannot spend past the cap because the ExecutionCenter, not the model, initiates the HTTP call.
- **Prompt-awareness is advisory only.** The system prompt states the remaining budget so the model self-throttles (token-mgmt brief), but this is optimisation, never enforcement.
- **Cost source of truth:** `sg-llm-request` returns per-call `cost` on completion; the ledger sums LLM costs + tool costs (infographic). Attribution flows to the SG/Sentinel accountant (cross-ref cost-attribution brief).
- **Memory-work sub-cap (Product input, Phase 2):** self-prune + (Track B) sidecars + consensus debit the **same** ledger, and a sub-cap (default **≤20%** of session budget) structurally prevents the prune-loop the brief warns about. The ledger tags each debit `task | memory | sidecar | consensus`.

```js
ledger = { budgetUsd, spentUsd, byTag:{task,memory,sidecar,consensus}, calls:[…] }
ExecutionCenter.preflight(kind, estimateUsd, tag) → {ok} | {refused, reason, remaining}
```

## 3. Visibility (the briefs' non-negotiable)

Every `execute()` and every `llm:send` writes a structured record to **one execution log** — the existing `app-debug-bridge-log` extended with `tool.*` and `llm.*` rows (doc 03 §4). The ExecutionCenter is the emitter. The CONFIRM card, the ledger, and the log are the three faces of the same stream.

## 4. The CONFIRM UX (arch-brief mockup, inline)

When a CONFIRM tool is called, `execute()` emits an approval event the chat renders **inline in the transcript** (not a modal), exactly the brief's mockup:

```
┌─ tool: create_infographic ───────────────────────────────┐
│  source = /work/data.csv  →  /work/totals.png             │
│  tier: COSTLY   est: ~$0.06   budget left: $0.74          │
│  preview: read data.csv → generate chart → write png      │
│      [ approve ]   [ approve always ]   [ deny ]          │
└───────────────────────────────────────────────────────────┘
```
- **approve** → run once. **approve always** → set session policy AUTO + run. **deny** → return a tool-result `{denied:true}` to the model (so the loop continues gracefully, not an error).
- DRY_RUN tools render the same card with **only** a preview and a `[ run for real ]` affordance.

## 5. `execute()` contract

```js
ExecutionCenter.execute(name, args) → Promise<ToolResult>
  1. policy = policies[name]; if !available → throw (should never happen: not in tools[])
  2. if tier in {COSTLY}: preflight(name, estimate(name,args), tagFor(name)); if refused → return {refused}
  3. switch(mode):
       AUTO    → result = sgToolRunner.run(name, args)            // existing
       CONFIRM → await approval; if denied → return {denied:true}; else run
       DRY_RUN → return {preview: sgToolRunner.dryRun(name, args)}
  4. emit tool.<name> log row {args, mode, ms, ok, cost?}; debit ledger if cost
  5. return result   // shape fed back as llm:tool-result
```

Built-in tools (`read_file/write_file/list_folder/delete_file` etc.) come from `sg-tool-runner`; their VFS target is the **`sg-vfs` memory working set** (doc 05), not `window.sg.vfs`. `create_infographic` and `flush_memory` are **custom tool definitions** (`sg-tool-definition`) whose runners call the `data-llm-bus` (infographic) and the `VaultFlushController` (flush) respectively.

---

*CC BY 4.0.*
