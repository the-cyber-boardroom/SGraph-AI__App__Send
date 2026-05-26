# 05 — VFS, Persistence & Memory: working set, modes, flush, self-prune, inspector

**version** v0.27.80 · **date** 26 May 2026 · **from** Architect · **type** Component spec

## 1. The working set = `sg-vfs` memory (inside the iframe)

The LLM's "file system" is a `sg-vfs` instance with a **memory** provider, loaded from `TOOLS/core/sg-vfs`. The tool-runner's `read_file/write_file/list_folder/delete_file` operate on it. Reads of vault files that aren't yet in memory are satisfied by a **pull-through**: `read_file('/report.pdf')` → if absent in memory → `sg.vfs.readText/read('/report.pdf')` (bridge → vault) → cache into memory → return. So the model sees one flat file system; behind it, memory is the universe and the vault is the source of truth for pulled-in files.

This is the briefs' "curated universe": only what is read in (or written) is in memory; the vault at large is not in the prompt.

## 2. Three persistence modes (Decision D5)

Selected per session at construction; the chat/tool-runner/inspector are **mode-agnostic** (they only ever see the `sg-vfs` bus).

| Mode | Working set | Persistence | Use |
|---|---|---|---|
| **`ephemeral`** (default) | `sg-vfs` memory only | **none** — nothing written to the vault unless the user explicitly saves | casual chat |
| **`snapshot`** | memory (+ optional `indexeddb` for crash-survival) | **zip the working set → one vault commit** at end-of-chat / on demand | token-mgmt brief's zip-to-vault; one artifact, one commit |
| **`synced`** | memory | **deferred-flush**: coalesced commits on a trigger | arch-brief's version-control-as-a-feature; auditable sessions |

## 3. `VaultFlushController` (BUILD-NEW — the deferred-flush coordinator)

Sits beside the working set; the **only** component that writes to the vault.

```js
class VaultFlushController {
  constructor(sgVfs, sgBridge /* window.sg */, mode)
  // tracks a dirty set from sg-vfs write/delete events
  markDirty(path, op)                         // from sg-vfs bus
  async flush(message)                        // memory → window.sg.vfs.writeBatch(dirtyItems, {message}) → ONE commit
  async snapshotZip(message)                  // zip whole working set → write /chat/snapshots/<ts>.zip via writeBatch → ONE commit
  triggers: 'turn-end' | 'explicit' | 'debounced'
}
```

- **`synced`** = auto-`flush()` on **turn-end** (one commit per user turn — the brief's "step-by-step"), plus an explicit `flush_memory` tool/button, optionally debounced.
- **`snapshot`** = single `snapshotZip()` at end-of-chat.
- **`ephemeral`** = controller present but inert; `flush_memory` (if the user enables it) writes once on demand.

A flush is **one commit** via `sg.vfs.writeBatch` (doc 03 §3) — never per-write. The commit message is the flush's `message` (turn summary, user note, or "snapshot"). This delivers the arch-brief's "commit-per-change = version control" as an **opt-in granularity dial**, with commit-free as the default.

## 4. Every message is a file + lossless self-prune

**Every message/response is a VFS file** (token-mgmt AC5) from day one — cheap, it's just a memory write: the chat writes each turn to `/chat/history/NNNN.json` in the working set as it happens. In `synced`/`snapshot` these persist on flush; in `ephemeral` they live for the session. Sidecars and self-prune then operate on real files, not a bolt-on.

**`consolidate_memory` (self-prune tool, BUILD-NEW):** the lossless compress the brief asks for.
```
consolidate_memory(scope, instruction) →
  1. read the in-scope /chat/history/*.json (+ working files)
  2. (LLM call, debited to the MEMORY sub-cap) produce a consolidation file → /chat/consolidated/<ts>.md
  3. return a new working-set manifest: which history files to DROP from the live prompt
  4. the ExecutionCenter rebuilds the live prompt from {system, consolidated, recent tail}
```
Lossless because the originals remain in `/chat/history/` (and, if persisted, in the vault). The user can see and curate it (the inspector, §5). Triggers (token-mgmt brief): **user**, **main-LLM** (within the memory sub-cap), and **sidecar** (Track B). Start user-triggered; enable automatic as it proves reliable.

**Librarian patterns adopted** (token-mgmt brief): catalogue the working set (manifest), graph-native layout (`/graph/**`, doc 06), on-demand load (pull-through, §1), compress-to-scale (`consolidate_memory`), weeding (mark superseded in the manifest, never destroy), provenance (history files carry source refs).

## 5. Context-layers inspector (BUILD-NEW — a viewer, not a system)

A read-only view over the layers the LLM sees this turn (arch-brief mockup). It reads existing buses only.

```
┌─ WHAT THE LLM SEES (this turn) ─────────────────────────┐
│  VAULT (via bridge)  report.pdf, data.csv  [scope: /]   │
│  VFS WORKING SET     /work/summary.md, /chat/history/*   │
│  ATTACHMENTS         notes.md (pinned)                   │
│  HISTORY             12 msgs  [compress][edit][recreate] │
│  CONSOLIDATED        /chat/consolidated/1432.md          │
│  ─────────────────────────────────────────────────────  │
│  assembled prompt: ~4,200 tokens   ledger: $0.26/$1.00   │
│  [view full prompt]                                      │
└──────────────────────────────────────────────────────────┘
```
Sources: vault layer = `sg.vfs.list` (scope root); VFS = `sg-vfs` listing; attachments = session state; history = `/chat/history/*`; assembled prompt + token count = what the ExecutionCenter is about to send; ledger = §budget. "edit/recreate history" writes the history files — which is exactly the **chat-about-the-next-chat** capability (doc 06 §5 / arch-brief): one session edits `/chat/history/*` that another session reads as its starting context.

## 6. Path conventions (the working set)

```
/chat/history/NNNN.json        every message/response (turn record)
/chat/consolidated/<ts>.md     self-prune outputs (lossless)
/chat/snapshots/<ts>.zip       snapshot-mode artifacts
/work/**                       the LLM's scratch (summaries, charts, generated files)
/graph/**                      Track-B semantic graph (doc 06)
/.vault/**                     RESERVED — excluded from the working-set view (doc 09 §2)
```

---

*CC BY 4.0.*
