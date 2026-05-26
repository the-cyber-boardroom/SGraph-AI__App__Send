# 06 — Cognition (Track B): sidecars, consensus, semantic knowledge graph

**version** v0.27.80 · **date** 26 May 2026 · **from** Architect · **type** Design spec (TRACK-B — built after Track A substrate)
**reads with** doc 02 (buses), doc 05 (working set/graph paths), doc 04 (budget tags)

Track B is the cognition epic. Per D3 it is **fully designed now**; it is **built after** Track A's substrate (Phase 6) because its quality depends on a solid working set + execution center + budget ledger. The point of designing it now is to prove Track A exposes the right seams — which it does, with **no new substrate**.

## 1. The seams Track B reuses (no new substrate)

| Track-B need | Track-A seam |
|---|---|
| read/write files, graph storage | `sg-vfs` working set + `/graph/**` (doc 05 §6) |
| extra LLM calls on cheaper models | additional `sg-llm-request` instances on their own `data-llm-bus` |
| cost control | the **one** ledger, tagged `sidecar`/`consensus` (doc 04 §2) |
| enable/disable | ExecutionCenter loadout config |
| visibility | the same execution log (`llm.*` rows) |

## 2. Sidecars (token-mgmt brief)

A sidecar is an **additional `sg-llm-request` driven by the harness** on a cheap model, reading/writing the same working set, off the main transcript. Each is **enable/disable-able** and **budgeted** (memory/sidecar sub-cap).

| Sidecar | Trigger | Reads | Writes | Built |
|---|---|---|---|---|
| **Prompt-injection screen** | on inbound untrusted content (before it reaches the main model) | the candidate content | a verdict + fenced/sanitised version, or a block | **first** (security floor++) |
| **Extraction** | on new history/work files | `/chat/history/*`, `/work/*` | facts/refs/evidence → `/graph/**` | second |
| **Curation** | debounced | working set | reorganises, marks superseded (weeding) | third |
| **Consolidation** | on size/turn threshold | history | `/chat/consolidated/*` (same output as `consolidate_memory`) | with self-prune |

The injection sidecar is the strong form of doc 09 §3 — the SG/Sentinel "slow-analysis / fast-enforcement, LLM-never-inline" pattern: the sidecar analyses; the ExecutionCenter enforces. The four Track-A injection items (doc 09 §3) are the floor; this sidecar is the ceiling.

```js
Sidecar = { name, model, enabled, trigger, run(ctx) → {writes:[…], verdict?} }
SidecarBus: listens to sg-vfs + chat events, dispatches enabled sidecars, debits ledger(tag='sidecar')
```

## 3. Multi-LLM consensus (token-mgmt brief)

Native support to ask the same question to N models and consolidate one answer.
```
consensus(question, models[], consolidator) →
  1. fan out N llm:send (parallel, each debited tag='consensus')
  2. collect N answers → write each to /work/consensus/<q>/<model>.md
  3. consolidator model merges → one answer (+ a confidence/divergence note)
  4. higher-confidence facts feed the extraction sidecar → /graph/**
```
Budget-gated (consensus is N× cost): the ExecutionCenter preflights the **sum** and refuses if over cap. Exposed as a tool (`ask_consensus`, CONFIRM/COSTLY) and as a UI mode.

## 4. Semantic knowledge graph (token-mgmt brief, facts/hypotheses/evidence)

Graph-native, Librarian-style, stored as VFS files under `/graph/**`, persisted via the same flush/zip (no special storage).
```
/graph/nodes/<id>.json     {id, type:'fact'|'hypothesis'|'evidence'|'entity', label, props}
/graph/edges/<id>.json     {id, from, to, rel:'supports'|'contradicts'|'derives'|'mentions', provenance}
/graph/index.json          finding aids (curated subgraphs per task)
```
- Built by the **extraction** + **consensus** sidecars; navigated on demand (load a subgraph, not the whole graph — the Librarian lesson).
- This is the groundwork for **vaults about news stories / documents / research** (facts, hypotheses, evidence) the brief points to. The graph is the densest form of the chat's memory and is what makes large context manageable.

## 5. Chat-about-the-next-chat (arch-brief, enabled by history-as-files)

Because every turn is a file (doc 05 §4) and the inspector can edit history (doc 05 §5): one session edits `/chat/history/*` (or a curated `/chat/next/context.json`); a second session is constructed with that folder as its starting context. Two panes, one curating the universe the other sees. No new mechanism — it's history-as-editable-files + session construction.

## 6. Build order within Track B (Phase 6)

injection sidecar → extraction sidecar → graph writes → consensus → curation/consolidation sidecars → graph-native finding aids. Each is independently enable/disable-able and independently budgeted, so Track B ships incrementally without destabilising Track A.

---

*CC BY 4.0.*
