# 06 — Implementation Status (snapshot)

**Pack version** v0.28.7 · **Date** 2026-05-28 · **From** Dev (Explorer team)
**Branch:** `claude/exciting-brown-G2P9Z`
**Read this** when picking up a new session to know what's done vs. queued.

---

## What ships in this branch — Phases 1 + 2

### Phase 1 — `SecureChannel` foundation ✅

| Module | Purpose |
|---|---|
| `_common/js/components/app-shell/secure-channel-envelope.js` | Pure WebCrypto envelope. `pack`/`unpack`, ECDSA P-256 sign, ECDH-AES-GCM encrypt, `ReplayGuard`, three payload kinds (`bytes` / `json` / `mixed`). The `mixed` kind solves review B2 at the request layer (`vfs.write { path, data:<Uint8Array> }`): structured-clone for the wire, canonical-bytes-with-`__u8`-base64 for the signature. |
| `_common/js/components/app-shell/secure-channel.js` | Port-anchored authenticated channel. `create` / `accept` / `request` / `send` / `handle` / `on` / `close`. The ONE `iframe.contentWindow.postMessage` at birth; everything else is on `MessagePort`s. Sensitive mode adds the one-use K1 handshake. Directional rule (review B1): `request()` restricted to initiators; `send()` works both ways for events + replies. Reply types `__ok` / `__err` carry the value directly so binary results round-trip byte-exact. |
| `tests/unit/vault_ui/loader/test__secure_channel_envelope.js` | **29 jsdom-free assertions.** Pack/unpack signed + encrypted, T5 (tamper / wrong-key fail-closed), T6 (replay-guard), **E7** PNG-byte round-trip signed + encrypted (review B2), **E8** `encryptBytes` tamper-detect, padding edges (0/1/1MiB), 1000-nonce uniqueness, Unicode JSON. |
| `tests/unit/vault_ui/loader/test__secure_channel.js` | **14 jsdom-free assertions.** C1 round-trip, **C2** sensitive (K1) handshake + secrets encrypted (with sniffer-confidentiality check), **C3a** responder.request throws (review B1), **C3b** responder.send('ready') reaches initiator.on('ready'), **C5** PNG bytes round-trip live MessageChannel (T13 / B2), 5 concurrent request id-correlation, error code propagation, close → `EUNREACH`. |

### Phase 2 — Spawn + cross-vault write (the driving use case) ✅ (browser-verify still pending)

| Module / file | Purpose |
|---|---|
| `kernel-mounts.js` | `KernelMounts.add/remove/get/list/resolve`. Longest-prefix match with traversal-collapse (uses `AppPermissions.normalizePath`). `resolve('mounts/p')` returns `rest === ''` (review N1). |
| `kernel-broker.js` | `KernelBroker` per-kernel sidecar. `mediate(op,mountId,path,credentialClass)` → `{ decision, entryId }`; `finalize(entryId, result)` (review N3 — concurrent-safe). Default policy: `fs.read=auto`, mutations = `ask`. Audit hygiene: log records metadata only. |
| `app-permissions.js` | Extended with `vault.mount` capability key (parsing + `can()`). Existing 39 shipped assertions still green. |
| `app-shell.js` | `__sgCmdType:'vault'` switch extended with `mount` / `unmount` / `mounts` actions. `_mountChildVault` builds a `null`-origin srcdoc iframe with `KERNEL_SHELL_HTML`, runs `SecureChannel.create({sensitiveKey:true})`, delivers `{vaultKey,accessToken}` encrypted, waits for child `ready`. `_handleVfsViv` resolves mounts → broker.mediate → relay over the child's SecureChannel. `vfs.read` / `vfs.write` bridge handlers now route through `_handleVfsViv` when a mount applies. `_resolveChildCredentials(ref)` is a trial-only stub reading `clinic.json` from the parent vault; the cleaner production model (port-transfer to Kernel-A) is documented but deferred. |
| `scripts/build-kernel-shell-bundle.py` | Concatenates all kernel + `sg-vault*` + `sg-send*` + `vault-data-source` + `vault-links` + `kernel-mounts` + `kernel-broker` sources, plus an inline child-kernel bootstrap (the ONE window.message listener), into one self-contained HTML string. Output: `kernel-shell-bundle.js` setting `globalThis.KERNEL_SHELL_HTML`. 191 KB, syntax-clean. **Run this before any change that touches the bundled modules.** |
| `kernel-shell-bundle.js` | AUTO-GENERATED. Loaded on `/en-gb/app`. |
| `tests/unit/vault_ui/loader/test__kernel_mounts.js` | **13 assertions** (M1-M12). |
| `tests/unit/vault_ui/loader/test__kernel_broker.js` | **22 assertions** (BR1-BR12, incl. **BR7** concurrent finalize by `entryId` — review N3). |
| `tests/unit/vault_ui/loader/test__kernel_relay.js` | **16 integration assertions.** Uses real `SecureChannel` + `KernelMounts` + `KernelBroker` + a synthetic in-memory data source. **R2/R3** PNG-byte read+write across the relay byte-exact (T13 / review B2), **R5** mount-root list (N1), **T7** child-capability `EPERM`, **T8** two-sided refusal, **T9** per-request elevation single-use, **T3a/b** directional (review B1), **T4** non-transitive reach. |
| `tests/unit/vault_ui/loader/test__app_permissions_vault_mount.js` | **6 assertions** (VM1-VM6). |

**Totals so far:** 39 (shipped `app-permissions`) + 29 (envelope) + 14 (channel) + 13 (mounts) + 22 (broker) + 16 (relay) + 6 (vault.mount perm) = **139 jsdom-free assertions, all green.** Run: `bash tests/unit/vault_ui/loader/run-all.sh` (skip jsdom-dependent tests if jsdom isn't installed; each non-jsdom test runs cleanly on its own).

### What's deliberately NOT done in Phase 2 (browser-only gates)

These are not implementation gaps — they're the per-spec live-environment checks that cannot be exercised from Node:

- **T1 / T2** — null-frame `parent.document` / `localStorage` access throws. Run the probe page in a real browser (Phase 3 §7).
- **T10** — null-origin GET + PUT to `dev.send.sgraph.ai` round-trip with the new CORS config. The code fix is on `dev` (commit `434106dc`); confirm the CDN forwards `Origin` + honours `Vary: Origin` + the cache is invalidated, per the architect pack §6.5–6.6 + `02-PHASE-2 §preconditions`.
- **Phase 2 §7 end-to-end** — clinician console writes `mounts/patient-acme/data/reviews.json`; broker prompts; child kernel persists on its own server edge; the patient vault opened separately shows the bytes.

---

### Phase 3 sub-step C prep — `sg-app-stub.js` ✅ (landed; not yet wired)

| Module / file | Purpose |
|---|---|
| `_common/js/components/app-shell/sg-app-stub.js` | The iframe-side `window.sg.*` API. Secret-less; every method is a `SecureChannel.request` to the kernel. The **APP is the channel-initiator** (it makes requests); the **kernel is the responder** (handles them, emits events like `sg.ready`). One `window.message` listener for the bootstrap, self-removing. `sg.app.*` metadata populated from the kernel's `sg.ready` event payload. Standalone module — **not yet injected** into `_buildAppSrcdoc` (that's full sub-step C, after sub-step A extracts the kernel-side handlers). |
| `tests/unit/vault_ui/loader/test__sg_app_stub.js` | **13 jsdom-free assertions** (S1-S9). PNG-byte round-trip through the stub (B2 / T13 at the stub layer), `sg.ready` event hydration, error code propagation via `__err`, smoke audit that `window.sg` holds no `vaultKey`/`accessToken`/`_dataSource`/`_vault` literals. |

**Updated totals:** 39 + 29 + 14 + 13 + 22 + 16 + 6 + 13 = **152 jsdom-free assertions, all green.**

---

## Phases 3 (remaining) – 6 — design only (queued, NOT implemented)

Phase 3 (standalone `/app` → null-origin + bridge split) is the security gate that closes
`SECURITY-same-origin-app-bypass.md`. The implementation plan is fully specified in
[`03-PHASE-3-null-app-and-bridge-split.md`](./03-PHASE-3-null-app-and-bridge-split.md) — the parity list
P1-P7 is the precise checklist. Sub-step C's stub is now **prepared** (above); sub-step A (kernel-side
handler extraction) is the next concrete code change. **Recommended sub-step order** (each is a small
PR, only step E breaks):

1. A — move bridge handler bodies into `kernel-handlers.js` (pure refactor; still same-origin).
2. B — add `SecureChannel.create` + `handle(...)` wiring kernel-side (legacy bridge still loaded).
3. C — add `sg-app-stub.js` and inject via `_buildAppSrcdoc`; **keep** `allow-same-origin` for parity.
4. D — walk parity list P1-P7 (one small PR each, re-test the app each time).
5. E — **drop `allow-same-origin`** from the 4 sandbox sites. The probe page (T1/T2/T3) must come back `BLOCKED` for all three. *This is the security gate flipping.*
6. F — delete the dead legacy bridge in `app-shell.js`.

Phase 4 (unify the three iframe contexts) becomes mechanical once Phase 3 lands — same kernel + same
channel, only the data source differs (live vault / read-only / dirty-buffer overlay).

Phase 5 (UI consumers — vaults page, tree-view-expand-as-mount, CLI/REPL) sequences after Phase 2 §7
is green, because it aggregates broker logs from running kernels.

Phase 6 (hardening) — SecureChannel everywhere, monitoring-mode visibility wiring (D6), curve upgrade
P-256 → X25519/Ed25519 iff target-browser support is solid.

---

## Critical-path summary for the next session

```
[ DONE      ]  Phase 0.5 CORS code fix on dev (commit 434106dc)
[ DONE      ]  Phase 1 SecureChannel module + 43 unit assertions   (merged to dev)
[ DONE      ]  Phase 2 modules + bridge wiring + bundle             (merged to dev, +57 asserts)
[ DONE      ]  Phase 3 sub-step C prep — sg-app-stub.js + 13 tests  (on branch, not yet merged)
[ TO RUN    ]  Phase 0.5 operational: CDN cache invalidation + real-browser null-frame round-trip
[ TO RUN    ]  Phase 2 §7 browser end-to-end (KneeScore-style cross-vault write)
[ NEXT      ]  Phase 3 sub-step A — extract kernel-side handlers into class methods (refactor only)
[ THEN      ]  Phase 3 sub-step B — wire SecureChannel kernel-side, parallel to legacy bridge
[ THEN      ]  Phase 3 sub-step C — inject sg-app-stub.js via _buildAppSrcdoc (still allow-same-origin)
[ THEN      ]  Phase 3 sub-step D — walk parity list P1-P7
[ THEN      ]  Phase 3 sub-step E — DROP allow-same-origin from the 4 sandbox sites (security flip)
[ THEN      ]  Phase 3 sub-step F — delete dead legacy bridge in app-shell.js
[ AFTER     ]  Phase 4 — unify the three iframe contexts (data-source-overlay for edit preview)
[ AFTER     ]  Phase 5 — vaults page + tree-view-expand + CLI
[ AFTER     ]  Phase 6 — hardening (curve upgrade, monitoring-mode visibility)
```

**Recommended next action when resuming:** run `bash tests/unit/vault_ui/loader/run-all.sh` to confirm
the 139 jsdom-free assertions are green, then **the §7 browser check is the first thing to attempt**
(needs a `dev` browser session + a trial clinic vault with a populated `clinic.json`). Phase 3
sub-step A is a safe refactor to start in parallel.
