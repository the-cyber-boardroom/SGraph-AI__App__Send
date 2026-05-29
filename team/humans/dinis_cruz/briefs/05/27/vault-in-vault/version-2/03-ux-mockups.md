# 03 — UX Mockups

**Pack version** v0.28.7 · Companion to `01-architecture-review.md`.
These are the **consumer** surfaces (D8): they sequence *after* the primitive proves out. All are views over the same machinery — none introduce new mechanism. Mockups are wireframes for intent, not pixel specs; defer visual styling to the `frontend-design` conventions.

---

## 3.1 The Vault-in-Vaults page (`/vault/vaults`)

The operator's view of the open ViV tree. **Aggregates by querying each kernel's own broker** (no central collector — §01 §8). Open kernels shown side by side; the broker log and per-request authorise prompts surface here.

```
┌─ VAULTS-IN-VAULTS ──────────────────────────────────────────────[ tree ▾ ][ ⟳ ]┐
│                                                                                  │
│  ┌─ Kernel A · clinician-console ──────────┐   ┌─ Kernel B · patient-acme ─────┐ │
│  │ ● real origin   vault.sgraph.ai         │   │ ○ null origin   (mounted by A)│ │
│  │                                          │   │                               │ │
│  │ app:   roster-dashboard                 │   │ app:   knee-check-in          │ │
│  │ files: roster.json · links/ · report.md │   │ files: data/reviews.json      │ │
│  │ grant: (self) full                       │   │ grant: rw → ["data/"]  (from A)│ │
│  │ keys:  origin-boot                       │   │ keys:  child-gen · ISOLATED 🔒 │ │
│  │                                          │   │                               │ │
│  │              mounts ──────────────────────▶  (1 child)                       │ │
│  └──────────────────────────────────────────┘   └───────────────────────────────┘ │
│                                                    └─ Kernel C · lab-results (ro) ─┐ │
│                                                       ○ null · mounted by B        │ │
│                                                       app: results-view            │ │
│                                                       grant: ro                    │ │
│                                                       keys: child-gen · ISOLATED 🔒 │ │
│                                                    └───────────────────────────────┘ │
│                                                                                  │
│  ┌─ BROKER ACTIVITY (aggregated; each row from the parent kernel's broker) ──────┐ │
│  │  time     edge    op     path                  cred     policy   result        │ │
│  │  10:02:13 A ▶ B   read   data/reviews.json      —        auto     ok (3.1 KB)   │ │
│  │  10:02:55 A ▶ B   write  data/reviews.json      rw(1-use) ask     ⏳ awaiting…  │ │
│  │  10:01:40 B ▶ C   read   results/knee-mri.json  —        auto     ok            │ │
│  │  09:58:02 A ▶ B   list   data/                  —        auto     ok (4 items)  │ │
│  └────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ⚠ Monitoring mode: OFF on all kernels (production).   [ debug build only ]      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Notes for the implementer:
- **`🔒 ISOLATED`** vs **`👁 MONITORED`** badge per kernel reflects D6. If any kernel is in monitoring mode (debug builds only), its badge flips to `👁 MONITORED` and the footer banner turns to a visible warning. Isolation must look like the default and monitoring must look like an exception.
- The `● real origin` / `○ null origin` dot is the single most important literacy cue on this page — exactly one kernel is ever `●`.
- "mounts ──▶" is a live edge; clicking it focuses the child. The tree affordance (top-right `tree ▾`) collapses the side-by-side into the §3.3 tree.

## 3.2 The per-request authorise prompt (broker, `ask` policy)

Raised by a kernel's broker when a child invocation hits an `ask` policy. This is the **inter-kernel edge** gate (Edge 2), never a server-traffic prompt.

```
┌─ AUTHORISE INTER-VAULT REQUEST ──────────────────────────────────┐
│                                                                   │
│   App  clinician-console  (in Kernel A)                           │
│   wants to   WRITE                                                │
│   file       data/reviews.json                                    │
│   in vault   patient-acme   (Kernel B, mounted read-only)         │
│                                                                   │
│   Elevation  a one-use WRITE token will be passed for THIS        │
│              request only, then discarded.                        │
│                                                                   │
│   Child policy  patient-acme permits fs.write → ["data/"]  ✓      │
│                                                                   │
│   [ Authorise once ]   [ Always allow A▶B writes to data/ ]       │
│   [ Deny ]                                                        │
│                                                                   │
│   ▸ what gets logged: edge, op, path, cred-class, your choice     │
└───────────────────────────────────────────────────────────────────┘
```

- "Always allow …" writes a per-mount/per-capability policy entry so future identical invocations go `auto`.
- The prompt states the **two-sided** result up front: the elevation (parent side) *and* the child policy check (`✓`) — so the user sees both gates (§01 §9).

## 3.3 Tree view — expanding a linked vault (100% compatible)

The familiar tree view is a **consumer** of the primitive. Expanding a linked node is not special: it **creates the Vault app** (a `null`-origin kernel for the link) and **connects**, then reads through it.

```
  BEFORE expand                          AFTER expand (mounts + connects)
  ▾ clinician-console                     ▾ clinician-console
    ▸ roster.json                           ▸ roster.json
    ▾ links/                                ▾ links/
      ▸ 🔗 patient-acme   ◀── click          ▾ 🔗 patient-acme   ○ null · connected
                                                ▸ data/
                                                  ▸ reviews.json
                                                ▸ check-in.html
                                              (reads relay A▶B; broker logs each)
```

Implementer note: the expand handler calls the same mount path as a programmatic mount — it spawns the child kernel (§02 2.4), establishes the port, and lists through `sg.vfs.list` crossing the mount. No bespoke tree-only data path.

## 3.4 CLI / REPL — the lightweight SG-API surface

When one vault accesses another **programmatically**, booting a full UI is wasteful. A REPL over `sg.*` is enough. (Full UI still available when a human needs to interact — §3.5.)

```
┌─ sg › patient-acme ─────────────────────────────────────────────[ ○ null ]┐
│ sg> vfs.list data/                                                          │
│ data/reviews.json        3.1 KB   rw                                        │
│ data/baseline.json       1.8 KB   ro                                        │
│                                                                             │
│ sg> vfs.read data/reviews.json | head                                       │
│ [ { "date":"2026-05-20", "score":42, "clinician":"…" }, …                  │
│                                                                             │
│ sg> vfs.write data/reviews.json <<< $review     # broker: ask → authorise   │
│ ⏳ awaiting authorisation (A▶B write data/reviews.json) …  [authorised]      │
│ ok · committed b/data/reviews.json · pushed                                 │
│                                                                             │
│ sg> mounts                                                                  │
│ patient-acme   ○ null   rw→["data/"]   isolated 🔒                          │
│ lab-results    ○ null   ro             isolated 🔒  (under patient-acme)     │
│                                                                             │
│ sg> _                                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

- Commands map 1:1 to the `sg.*` surface in `04-message-protocol-spec.md` (`vfs.read/write/list/delete`, `vault.mount/unmount`, `mounts`, `broker.log`).
- Cross-vault calls go through the broker identically to the GUI — the REPL is just another caller. An `ask` policy still raises the §3.2 prompt (or a CLI confirm).
- Scope deliberately small: file ops + mount inspection + broker log. Not a shell.

## 3.5 Embedded full-UI with user-supplied credentials (Scenario 2)

The case where **only the embedded iframe knows the credential**: App A opens B's kernel as a full UI and the **human types B's key into B**. A's kernel is deliberately blind to the credential; B's own policy is the only gate.

```
┌─ clinician-console ───────────────────────────────────────────────────────┐
│  Open linked vault:  patient-acme                                          │
│  ┌─ patient-acme  ○ null origin · embedded ───────────────────────────────┐│
│  │  🔑 This vault is locked. Enter its key to unlock.                       ││
│  │     key  [ ····················· ]   [ Unlock ]                          ││
│  │     (the key stays inside this frame; the parent console cannot read it) ││
│  └──────────────────────────────────────────────────────────────────────────┘│
│   note: because the parent never holds this credential, the parent's broker  │
│         is NOT on this edge — patient-acme enforces its own policy.          │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 3.6 Standalone `/app` after the null-origin hardening (no visible change)

Phase 3 moves the standalone app frame to `null`-origin with a secret-less `sg.*` stub. For **cooperative first-party apps the UI is unchanged** — the point is invisibility. The only user-visible surface is a clearer permission/consent HUD (already shipped, Phases 1–4B) now backed by a *real* boundary rather than an advisory one. Implementer cue: success here is "nothing looks different, but `localStorage`/`window.parent`/ambient `fetch` from app code now fail."
