# ViV Implementation — Index & Working Notes for a New Claude Session

**Pack version** v0.28.7 · **Date** 2026-05-28 · **From** Dev (Explorer team)
**Audience** A fresh Claude Code session with access to this repo, picking up the Vault-in-Vault build.

This folder contains the **code-level** implementation guide for the ViV refactor. It complements (does
**not** replace) the normative architect pack at
[`team/humans/dinis_cruz/briefs/05/vault-in-vault/version-2/`](../../../../../../humans/dinis_cruz/briefs/05/vault-in-vault/version-2/) — that pack is the design source of truth; this folder is "how to actually
land the code." Where the two disagree, the architect pack wins.

---

## What you (the implementing session) should do first

1. **Read the architect pack in this order** — these are normative:
   - [`00-README.md`](../../../../../../humans/dinis_cruz/briefs/05/vault-in-vault/version-2/00-README.md) — pack map + decisions log (D1–D8).
   - [`01-architecture-review.md`](../../../../../../humans/dinis_cruz/briefs/05/vault-in-vault/version-2/01-architecture-review.md) — **the design** (14 invariants, two edges, broker, PKI, what changed from v0.27.79).
   - [`02-architecture-diagrams.md`](../../../../../../humans/dinis_cruz/briefs/05/vault-in-vault/version-2/02-architecture-diagrams.md) — ASCII for the topology and every flow.
   - [`04-message-protocol-spec.md`](../../../../../../humans/dinis_cruz/briefs/05/vault-in-vault/version-2/04-message-protocol-spec.md) — **the wire** (SecureChannel API, envelope, sg.* surface, broker interface, error codes).
   - [`05-implementation-plan.md`](../../../../../../humans/dinis_cruz/briefs/05/vault-in-vault/version-2/05-implementation-plan.md) — verified file:line targets, phasing, adversarial tests T1–T12.
   - [`06-appendix-cors-change.md`](../../../../../../humans/dinis_cruz/briefs/05/vault-in-vault/version-2/06-appendix-cors-change.md) — the one-line server change that unblocks Phase 2.

2. **Then read the code-level guides in this folder** — these are the per-phase implementation specs:
   - [`01-PHASE-1-securechannel.md`](./01-PHASE-1-securechannel.md) — build the `SecureChannel` module + unit tests.
   - [`02-PHASE-2-spawn-and-cross-vault-write.md`](./02-PHASE-2-spawn-and-cross-vault-write.md) — the driving use case (clinician console writes `data/reviews.json` in a patient vault).
   - [`03-PHASE-3-null-app-and-bridge-split.md`](./03-PHASE-3-null-app-and-bridge-split.md) — the security gate (standalone `/app` frame becomes `null`-origin).
   - [`04-PHASES-4-6-and-tests-and-repair.md`](./04-PHASES-4-6-and-tests-and-repair.md) — unify the three iframe contexts, UI consumers, the adversarial test matrix in implementation form, and the agent-facing vault-repair checklist.

3. **Then check the current shipped state** — the permission model (Phases 1–4B of the prior capabilities
   work) is shipped and is the *child policy* gate in this design. The relevant code:
   - [`app-permissions.js`](../../../../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/app-permissions.js) — pure, unit-tested. Stays as-is; relocates kernel-side.
   - [`app-shell.js`](../../../../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/app-shell.js) — the bridge currently inlines the kernel + the stub. Phase 3 splits them.
   - The agent-facing migration guide: [`MIGRATING-TO-THE-PERMISSION-MODEL.md`](../../../../../../../library/guides/vault-html/MIGRATING-TO-THE-PERMISSION-MODEL.md) — extend with the `null`-origin contract in Phase 3.

4. **Verify file:line drift before you start.** The plan at version-2 §5.1 lists targets verified
   2026-05-28. If HEAD has moved, re-pin with the script in
   [`04-PHASES-4-6-and-tests-and-repair.md` §"Re-pin targets"](./04-PHASES-4-6-and-tests-and-repair.md).

---

## Working rules for the implementing session

- **One primitive.** If you find yourself writing a second mechanism for the cross-vault case, **stop**
  and re-read version-2 §01 §1. Accessing data within a vault and across vaults is the **same operation**.
- **Two edges, never merged.** Server edge (kernel ↔ SG/API) is direct, per-kernel, unbrokered. Inter-kernel
  edge (parent kernel → child kernel) is brokered, the only relay. Mixing them re-centralises the design.
- **Ports, not `window`.** Exactly **one** `iframe.contentWindow.postMessage(initMsg, '*', [port])` per
  child, at birth. After that, everything is on `MessagePort`s. **No `event.source`, no `window.parent`,
  no `frames[]`** — those are deliberately removed (see version-2 §04 §4.1).
- **Breakage is acceptable, with docs.** Optimise for a clean design over compat shims. Each phase has
  a "what breaks + how an agent fixes it" section; keep those tight so vault repair is mechanical.
- **Commit per phase.** Commit/push after each milestone in the phase doc — the container is
  ephemeral. Use the existing commit-message style (`feat(app-mode):`, `fix(vault-ui):`, etc.).
- **Test before claim.** A phase isn't done until its gating check (version-2 §5.2) is green.

## Operating environment notes

- **Branch:** develop on `claude/<your-session-id>`. Pull from `dev` first
  (`git fetch origin dev && git merge origin/dev`).
- **Tests:** the jsdom-free harness in `tests/unit/vault_ui/loader/` is where `app-permissions.js`-style
  unit tests run — use the same `runInThisContext` pattern (see `test__app_permissions.js`). `jsdom` may
  not be installed in the container; non-jsdom tests still run.
- **Browser verification:** the harness can't drive the full real browser; per-phase docs flag the
  manual/Playwright checks. Phase 0.5 (CORS) **must** be confirmed in a real browser before Phase 2 is
  considered done.
- **Don't touch** `sgraph_ai_app_send/version` (owned by CI). Don't push to `dev`.

## Critical-path order

```
Phase 0.5 (CORS, Dinis)  ────┐
                              ├──▶  Phase 2 (driving use case)  ──▶  Phase 4 / 5 (unify / UI)
Phase 1 (SecureChannel) ─────┘
                                                                ╲
Phase 3 (bridge split — security gate, parallel after Phase 2) ──┴──▶  Phase 6 (hardening)
```

Phase 0.5 is an external dependency (Dinis applies the CORS change in AWS — version-2 §06). Phases 1
and 0.5 can proceed in parallel. Phase 2 is blocked on both. Phase 3 is the security deliverable and
gates any third-party-app roadmap; if no third-party apps are planned, it can sequence after Phase 5.

> **CORS status (as of 2026-05-28):** the **code-side fix is shipped** in `dev` — `Fast_API__SGraph__App__Send__User.py:117`
> is now `allow_credentials = False` with `allow_origins = ["*"]` preserved (commit `434106dc`,
> confirmed by the v0.29.2 architect review). The **remaining 0.5 work is operational** — CDN cache
> invalidation, confirm CloudFront forwards `Origin` + honours `Vary: Origin`, and the real-browser
> null-frame round-trip (architect pack §6.5–6.6). These must be green before Phase 2's browser end-to-end
> test (`02-PHASE-2 §7`), **not** before Phase 1.

## Pre-build architect review (v0.29.2) — patches applied

The v0.29.2 architect review (`team/humans/dinis_cruz/briefs/05/vault-in-vault/version-2/v0.29.2__architect-review__viv-implementation-plan.md`)
flagged two blocking defects in the Phase 1 doc; both are now patched. If you are reading this folder
for the first time, the **post-review** state is:

- **B1 (resolved):** the `directional` rule is precise — *only `request()` is restricted; `send()`
  works both ways*. All `window.top` references have been removed from the impl pack — the design
  forbids upward `window`/`window.parent`/`window.top` reach. Phase 5a's vaults page aggregates by
  **querying each kernel**, not via a top channel.
- **B2 (resolved):** binary payloads (file bytes) travel as **structured-cloneable `Uint8Array`** in the
  envelope's `payload` field — they are **never** `JSON.stringify`-ed (that would yield `{}`). New tests
  E7/E8 (envelope) and C5 (live channel) + T13 (cross-vault relay) pin byte-exact round-trip with the
  PNG signature bytes. The `Envelope` helpers `encryptBytes`/`decryptBytes` take bytes, not JSON.
- **N1 (folded):** `vfs.list` with `rest===''` is handled by the existing local-op branch
  (`listFolder('/' + path)` with `path:''` ⇒ root); the relay forwards the empty path; a
  `KernelMounts` test pins `resolve('mounts/p')` → `rest:''`.
- **N2 (folded):** `02-PHASE-2-spawn-and-cross-vault-write.md` now opens with a hard precondition box
  for the CDN-clean real-browser CORS check.
- **N3 (folded):** `KernelBroker.mediate` returns an opaque `entryId`; `finalize(entryId, result)`
  closes the matching row regardless of concurrency.

## What "done" looks like (acceptance — version-2 §5.2 gating checks)

- **Phase 1:** `tests/unit/vault_ui/loader/test__secure_channel.js` green; T5/T6 (misroute, replay) covered.
- **Phase 2:** in a real browser, the clinician console writes `mounts/patient-acme/data/reviews.json`
  and the change persists on the patient's branch (verified by opening the patient vault directly);
  the broker log on Kernel-A records the invocation.
- **Phase 3:** all 4 sandbox sites in `app-shell.js` drop `allow-same-origin`; the parity list (§5.4)
  is green; a `null`-frame test confirms `localStorage`/`window.parent`/ambient `fetch` are now closed.
- **Phase 4:** the editor's split preview renders via the same kernel as `/app`; "preview ≠ runtime"
  gone.
- **Phase 5:** vault-in-vaults page lists each mount and its monitoring mode (visible per D6).
