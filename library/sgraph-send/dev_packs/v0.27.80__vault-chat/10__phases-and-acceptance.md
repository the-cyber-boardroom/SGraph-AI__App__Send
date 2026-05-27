# 10 — Phases & Acceptance

**version** v0.27.80 · **date** 26 May 2026 · **from** Architect · **type** Phasing + AC mapping

One programme, sequenced by substrate dependency. Phases 0–2 are the brief's "wire it up and try it"; Phase 3 is the real engineering (flush + keys); Phase 6 is the cognition epic.

## 1. Phases

| Phase | Builds | Gated on |
|---|---|---|
| **0 — Standalone shell** | Chat app + long test page (mock `window.sg`); chat + tool loop against **`sg-vfs` memory**; ExecutionCenter skeleton; bridge-log extended for `tool`/`llm` rows | nothing — pure reuse + new shell |
| **1 — Bridge wiring** | Mount chat as a Vault App; real `window.sg` read/list; vault manifest + on-demand `read_file` pull-through; right-hand pane | Phase 0 |
| **2 — Execution center** | Policies + loadouts + per-task availability; inline CONFIRM/DRY_RUN; **budget governor** (ledger, preflight, memory sub-cap); injection **floor** (fencing, no-self-widen) | Phase 0; AppSec §3 floor |
| **3 — Persistence + keys** | `sg.vfs.writeBatch` EXTENSION; `VaultFlushController`; `ephemeral`/`snapshot`/`synced`; `flush_memory`; **keys-in-vault** (`__sgSecrets` + `/.vault/**` exclusion) | Phase 1; AppSec §2 sign-off |
| **4 — Memory + inspector** | Every-message-as-VFS-file; `consolidate_memory` self-prune; context-layers inspector (+ full-prompt, history edit) | Phase 2–3 |
| **5 — Fractal + next-chat** | Scope = doc/folder/vault; chat-about-the-next-chat (history-as-files, two-pane) | Phase 4 |
| **6 — Track B cognition** | Sidecars (injection→extraction→curation/consolidation); multi-LLM consensus; semantic graph `/graph/**` | Phase 4 substrate |
| **7 — Keystone** | Vault Chat registered as a first-class vault surface; chat-created apps rendered via app-shell | Phase 1 bridge parity |
| **8 — Supply-chain hardening** | Pin + SRI, then vendor `TOOLS/` modules into `__Send` (R-supply exit) | AppSec §4 decision |

## 2. Acceptance-criteria coverage

**Architecture brief (vfs-iframe):** AC1→P0 · AC2→P1 · AC3→P0/P1 (iframe) · AC4→P2 · AC5→P1/P4 (curated working set + inspector) · AC6→P4 · AC7→P3 (`synced`) · AC8→P5 · AC9→P7 · AC10→this pack.

**Token-management brief:** AC1→doc 05 (continuous, baked-in) · AC2→doc 05 §4 (Librarian) · AC3→doc 04 §2 (budget in prompt) · AC4→P4 (self-prune) · AC5→P4 (every message a file) · AC6→P6 (sidecars) · AC7→P6 (consensus) · AC8→P6 (graph) · AC9→P3 (snapshot zip) · AC10→doc 04 §2 (budget incl. memory) · AC11→P3 (keys-in-vault).

**Dev brief:** AC1→P0 · AC2→P1 (manifest) · AC3→P2 (visible tools) · AC4→P1/P3 (read-write, scoped) · AC5→P2 (infographic + file tools) · AC6→P1 (right pane) · AC7→P3 (user's key from vault).

## 3. First buildable increment

**Phases 0–2** deliver a working, visible, budgeted, controllable chat with tool-calling against an in-memory working set — the dev brief's whole ask, decoupled and testable — **without** touching the vault for writes or handling the key. **Phase 3** adds real persistence + keys (the AppSec-gated engineering). That split lets Phase 0–2 ship and be tried while §2/§3 sign-offs complete.

## 4. Open items handed to other roles

| Item | Owner | Blocks |
|---|---|---|
| `/.vault/**` exclusion + bridge-leak audit; one-time `__sgSecrets` (doc 09 §2) | AppSec | Phase 3 |
| Injection fencing format + floor sufficiency (doc 09 §3) | AppSec | Phase 2 |
| R-supply: accept for first ship or pull Phase 8 forward (doc 09 §4) | AppSec + Lead | Phase 0–2 |
| Iframe `sandbox`/CSP spec (doc 09 §5) | AppSec + Dev | Phase 2 hardening |
| Memory-work sub-cap ratio (doc 04 §2) | Product + Architect | Phase 2 |
| Bridge EXTENSIONs review (doc 03) | Dev | Phase 1/3 |

---

*CC BY 4.0.*
