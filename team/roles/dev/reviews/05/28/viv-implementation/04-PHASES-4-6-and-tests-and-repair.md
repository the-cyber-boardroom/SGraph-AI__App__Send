# Phases 4–6 · Adversarial tests · Vault-repair checklist · Re-pin

**Pack version** v0.28.7 · **Audience** the agent finishing the refactor, writing the tests, and the
agent who later has to repair a vault broken by Phase 3.

This file rolls up the smaller phases plus the operational artefacts (test matrix, repair checklist,
target re-pin script). It is intentionally less prescriptive than Phases 1–3 — the heavy lifting is
done by then.

---

## Phase 4 — Unify the three iframe contexts

**Authoritative:** version-2 §01 §13 + §02 §2.8.

After Phase 3, the standalone `/app` is already the unified target. The two remaining contexts to fold
in:

| Context | Today | After Phase 4 |
|---|---|---|
| `/vault` HTML view (clicking an HTML file in the vault browser) | rendered via `send-browse`'s renderer | mount the same `Kernel` + `sg-app-stub` pair, with a **read-only data source** (the vault, but the kernel never exposes `vfs.write`) |
| `/vault` edit preview (split pane) | sandbox without `allow-same-origin` (causes the `SecurityError` from KneeScore MVP) | same `Kernel` + stub, with the **dirty editor buffer as the data source** (overlays the vault: the file being edited returns the unsaved bytes; everything else returns the vault bytes) |

### Implementation sketch

`kernel-boot.js` gains a constructor option:
```js
new Kernel({ kernelId, parentChannel, dataSource: 'live' | 'readOnly' | 'editorOverlay', overlayFiles? });
```

`overlayFiles` is a `Map<path, Uint8Array>` of dirty buffers for `editorOverlay`. The kernel's
`handleVfs` routes reads to the overlay first, falls back to the vault. Writes are blocked
(`EPERM`/`EPROTECTED` as appropriate).

`vault-browse-edit.js` (the editor split pane) replaces its current sandboxed iframe construction with
a `Kernel.mountAppPreview(filePath, dirtyBytes)` call. The editor pushes new dirty bytes by calling
`kernel.updateOverlay(filePath, bytes)` on each keystroke (debounced) — the kernel emits a `tree-changed`
event, the stub re-reads, the preview re-renders.

### Gating check

The KneeScore MVP's "edit preview ≠ runtime" complaint goes away because both contexts now run the
**same code** behind the same `null`-origin frame. Open a vault HTML file in the editor; the live
preview behaves identically to opening the same file via "Open as App".

---

## Phase 5 — UI consumers (vault-in-vaults page, tree-view-expand, CLI)

**Authoritative:** version-2 §01 §8 + §03-ux-mockups (also in the architect pack).

These are **pure consumers** of the primitive — they introduce no new mechanism. They sequence after
Phase 2 because they aggregate broker data from running kernels.

### 5a. Vault-in-vaults page

Location: `/en-gb/app/vaults` (or wherever the top kernel routes it). The page asks **each kernel** for
its broker log via `sg.broker.log()` — there is no central collector (would need tree-wide visibility,
which violates directional trust §4).

```
For each mount registered on the top kernel:
  fetch broker.log({ mountId }) — local Edge-2 log entries for that mount
  display: mountId, ref, label, isolation mode (👁 MONITORED if D6 debug-build),
           last N entries (op, path, decision, result)
  Click a mount → ask THAT kernel for its broker.log (recursive aggregation by query)
```

`sg.vault.mounts()` (version-2 §4.4) returns `{ mountId, ref, mode, origin: 'null', isolation: 'isolated'|'monitored' }`
per mount — the `isolation` flag is what the page renders as the badge (D6 visibility requirement).

### 5b. Tree-view expand-as-mount

Today the vault browser's tree view shows a sub-vault as a folder backed by a read-only mount. Phase 5
extends the expand affordance: clicking a `*.link.json` (or an expand icon next to one) triggers
`sg.vault.mount(...)` instead of (or in addition to) the existing composite-data-source read-through.
Read works as today; write is enabled by the new path.

### 5c. CLI / REPL

`developer/poc/cross-vault-lab.html` already exists as a manual harness. Convert it to a small REPL
running inside a vault app: `mount`, `read`, `write`, `list`, `log` commands all map to `sg.*` calls.
No new platform feature needed — this is purely a UX wrapper.

---

## Phase 6 — Hardening

**Authoritative:** version-2 §5.7.

Three independent items, each shippable on its own once Phases 1–3 are stable:

1. **SecureChannel everywhere.** Roll the channel out to remaining cross-context paths beyond the
   kernel ↔ app and kernel ↔ kernel edges — e.g. the worker that handles encryption (if added),
   inter-tab channels (if added). Same module, same envelope; this is "all cross-context messages use
   PKI" delivered fully.

2. **Monitoring-mode visibility wiring (D6).** When a kernel is spawned in **monitoring mode** (debug
   build, parent retains K2-priv access — version-2 §01 §10), the kernel's `sg.vault.mounts()` reports
   `isolation: 'monitored'`. The vaults page must show **`👁 MONITORED`** on that mount with a tooltip
   explaining what it means. **Production builds must hard-reject monitoring mode** at the SecureChannel
   level (e.g. via a build flag that strips the monitoring-mode code paths). The visibility check is a
   defence against monitoring becoming silent — *the same advisory-vs-enforced trap as the original
   same-origin finding, one layer up* (version-2 §01 §10).

3. **Curve upgrade.** P-256 (ECDSA + ECDH) is universal-supported; X25519 (ECDH) + Ed25519 (sign) is
   cleaner. Switch when target-browser support is confirmed. The Envelope module isolates the curve
   choice; the rest of the system is unaffected.

---

## Adversarial test matrix in implementation form

These are version-2 §5.3 T1–T12 expanded into runnable tests. Most live in
`tests/unit/vault_ui/loader/test__secure_channel.js` (Phase 1) and a new
`tests/unit/vault_ui/loader/test__kernel_relay.js` (Phase 2). T1–T3, T10, T12 are **browser** tests
(probe page); the rest are jsdom-free Node tests using `MessageChannel`.

| # | Where | Stub |
|---|---|---|
| **T1** *(null child reads `parent.document` → throws)* | `library/guides/vault-html/null-origin-probe.html` (Phase 3 §7) | manual: open the probe; expect `BLOCKED: SecurityError` |
| **T2** *(null child reads `localStorage` → throws)* | same probe | manual: expect `BLOCKED: SecurityError` |
| **T3** *(null child cannot initiate against `window.parent`)* | `test__kernel_relay.js` | spin up a kernel in node + a fake responder; assert the responder's `channel.request(...)` throws `directional: responder cannot initiate requests`. **Also assert the inverse: `responder.send('ready', …)` works** and the initiator's `on('ready', …)` fires (review B1 — `bootFromMessage` deadlocks otherwise). |
| **T4** *(grandchild C posts to top A; not transitive)* | `test__kernel_relay.js` | construct three kernels (A,B,C) wired A↔B and B↔C; assert C has no port to A and A's broker has no entry for C |
| **T5** *(misroute / forged envelope dropped)* | `test__secure_channel.js` (Phase 1, E3/E4) | tamper ciphertext or use wrong peerSignKey → `Envelope.unpack` throws `EPROTO` |
| **T6** *(replay nonce rejected)* | `test__secure_channel.js` (E5/E6) | reuse a nonce; `ReplayGuard.check` throws `EPROTO` |
| **T7** *(`vfs.write` with no capability → `EPERM`)* | `test__kernel_relay.js` | mount a child; the child kernel has `permissions.fs.write` absent; assert `EPERM` and no relay attempted past the child policy |
| **T8** *(parent grants, child policy refuses → `EPERM`)* | same | mount a child whose policy disallows the path; ensure the parent's capability cannot override it |
| **T9** *(per-request elevation, single-use)* | same | first write with inline credential ok; second write without credential `EPERM`; no retained credential in the child |
| **T10** *(null-origin GET + PUT to SG/API after the CORS fix)* | browser (Phase 0.5 §6.6 curl + real-browser iframe test) | both succeed; `ACAO: *` observed |
| **T11** *(isolation mode: parent cannot read child↔grandchild traffic)* | `test__kernel_relay.js` | in isolation mode the parent never holds K2-priv; sniffing the port traffic yields ciphertext only |
| **T12** *(monitoring mode visible)* | manual / Playwright | open vaults page with a kernel in monitoring mode; the `👁 MONITORED` badge is present |
| **T13** ★ *(binary payloads survive the wire — review B2)* | `test__secure_channel.js` (E7/E8/C5) + `test__kernel_relay.js` | round-trip `Uint8Array.of(0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A)` through (a) `Envelope.pack`/`unpack`, signed-only and encrypted, (b) a live `MessageChannel` via `SecureChannel.request`, (c) the full cross-vault `vfs.read`/`vfs.write` relay (Phase 2). At each layer assert byte-exact equality with the input. **This catches the JSON-strigification footgun that would silently return `{}` for file bytes** on the KneeScore driving path. |

★ = added by the v0.29.2 architect review.

Aim: T1–T9 and T11 land **before** Phase 3 ships to prod; T10 is the Phase 0.5 gate; **T13 is
mandatory before Phase 2's browser end-to-end (02 §7) — it's the load-bearing test for the entire
binary data path**; T12 is the Phase 5/6 gate.

---

## Vault-repair checklist (for agents finding broken vaults after Phase 3)

When a vault app stops rendering or fails to save after the Phase 3 deploy, walk this checklist. Each
item is a *mechanical fix*; the answer is in `library/guides/vault-html/`.

1. **DevTools console: `SecurityError: localStorage` / `sessionStorage`?**
   → Replace storage access with `sg.vfs.read/write('app-state/<key>.json')`. The kernel persists, not
   the app.

2. **DevTools console: `Failed to fetch` on a vault path?**
   → The app called `fetch('something.json')` (vault-relative). Replace with `sg.vfs.read('something.json')`
   or `sg.vfs.readText(...)`. Vault paths cannot be `fetch`-ed from a `null` origin.

3. **DevTools console: `TypeError` reading `window.parent.*`?**
   → The app reached into the parent. Use `sg.ui.message(...)` to surface info upward; no other parent
   reach exists in this model.

4. **App renders but writes fail with `EPERM` (no `code:'EPROTECTED'`)?**
   → Missing `permissions.fs.write` in `app.json`. Add the block via the Vault UI (NOT from the app
   itself — the floor blocks app self-modification of `app.json`). See
   `MIGRATING-TO-THE-PERMISSION-MODEL.md`.

5. **App renders but writes fail with `EPROTECTED`?**
   → The path is in the security floor (`.vault/**` or root `app.json`). The app must write under its
   own scoped folder (`data/`, `responses/`, …). Move the write target.

6. **App renders but a declarative `<link rel="stylesheet">` of a vault file 404s?**
   → Switch to `sg.loadCss('theme.css')` at runtime. Declarative `<link>` of vault paths never worked;
   it now fails harder under `null`. (Same for `<script src>` → `sg.loadJs`.)

7. **App shows a blank preview pane in the editor but works in the standalone `/app`?**
   → The Phase 4 unification didn't ship for this code path yet. Open the file via "Open as App"
   as the workaround; flag for the editor preview migration.

8. **Cross-vault write returns `ECONSENT`?**
   → The broker prompt was denied (user clicked deny) or the policy is `'never'`. Adjust
   `broker.setPolicy(mountId, capability, 'auto')` from the console app, or re-run and click Allow.

9. **Cross-vault write returns `EUNREACH`?**
   → The child kernel's SecureChannel is down (probably failed boot — bad credentials, or the child's
   `app.json` couldn't be read). Inspect the child mount with `sg.vault.mounts()`; check the child
   kernel's startup logs.

10. **App.json has a `permissions` block but writes still `EPERM`?**
    → Verify the block is in `.vault/app.json` (preferred) or root `app.json` (legacy fallback), and
    that the value is a recognised shape: `true`, `false`, or `string[]` of path prefixes/exacts. See
    `MIGRATING-TO-THE-PERMISSION-MODEL.md` for the exact schema.

---

## Re-pin file:line targets (for a session that finds drift)

Run this at the start of your phase to confirm version-2 §5.1's targets still resolve. If any number
differs, update the per-phase doc in this folder to match HEAD and proceed.

```bash
cd sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3
F=_common/js/components/app-shell/app-shell.js
echo "=== sandbox flag sites (expect 4, all 'allow-scripts allow-forms allow-same-origin') ==="
grep -n "iframe.sandbox\s*=\s*'allow-scripts" "$F"
echo "=== vault key reads (expect getItem('sg-vault-key') + setItem) ==="
grep -n "sg-vault-key" "$F"
echo "=== access token reads ==="
grep -n "sg-backend-access-key\|sg-access-key:" "$F"
echo "=== bridge handler region (expect __sgVfs*Req, __sgCmdType) ==="
grep -n "__sgVfs.*Req\|__sgCmdType" "$F" | head
echo "=== sg-send.js token header + mode (expect x-sgraph-access-token, mode:'cors') ==="
F2=_common/js/lib/sg-send/sg-send.js
grep -n "x-sgraph-access-token\|mode:\s*'cors'" "$F2" | head
echo "=== CORS config (expect allow_credentials=True — the bug; needs to become False) ==="
F3=../../../../sgraph_ai_app_send/lambda__user/fast_api/Fast_API__SGraph__App__Send__User.py
grep -n "allow_credentials\|allow_origins" "$F3" | head
```

Update the per-phase doc's `file:line` references if anything moved. The version-2 plan §5.0
warning is the right discipline: **lines drift; the design doesn't.**

---

## End-of-session checklist (for whoever ships the final phase)

- [ ] All adversarial tests T1–T12 pass (or are explicitly documented as deferred to a later phase).
- [ ] `library/guides/vault-html/AUTHORING.md` has a "Null-origin contract" section.
- [ ] `MIGRATING-TO-THE-PERMISSION-MODEL.md` has the Phase-3 repair checklist (§ above).
- [ ] Reality docs reflect new endpoints/files (the spec docs above are not enough — update
      `team/roles/librarian/reality/` per the project's reality-document policy).
- [ ] One end-to-end changelog per phase in `team/comms/changelog/MM/DD/` classifying expected breaks.
- [ ] No `window.addEventListener('message', …)` remains outside the SecureChannel bootstrap (grep for
      it; there should be exactly one in the app stub and one in the kernel shell).
- [ ] `git push -u origin claude/<your-session-id>` and (when ready) open a PR onto `dev`.

This is the end of the implementation guide. The architect pack stays the design source of truth; this
folder is the bridge to landing it.
