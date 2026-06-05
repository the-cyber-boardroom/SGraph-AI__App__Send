# 05 — Implementation Readiness + Test Catalog

**Pack version** v0.28.7 (post-review v0.29.2) · **Audience** the implementing agent + Dev review.
**Two purposes:**
1. **§A Readiness audit** — what's needed to land Phases 1-3 vs. what's truly missing, with confidence levels.
2. **§B Test catalog** — every new test file, every assertion (named), every project-rule-compliant ("no mocks, no patches, fast") test that covers the change surface. Use this as the test plan; tick assertions as you write them.

---

# §A · Readiness audit — what we have / what to confirm during the build

## What is solid (do not rewrite)

| Need | Source |
|---|---|
| **Design (normative)** | architect pack `briefs/05/vault-in-vault/version-2/01-04, 06` |
| **Phasing + file:line targets** | architect pack `§05` (verified on `dev` v0.29.2) |
| **Test runner pattern (jsdom-free)** | `tests/unit/vault_ui/loader/test__app_permissions.js` (39 assertions green); `run-all.sh` |
| **Permission policy engine (the child policy of D7)** | shipped `app-permissions.js` — reused verbatim, kernel-side |
| **Vault + sync stack** | `SGVault`, `VaultDataSource`, `sg-vault--sync.js` (commit + 3-way merge + publish — the hardening that landed earlier on this branch) |
| **Server-edge client (per-kernel direct I/O)** | `sg-send.js` — `mode:'cors'`, `x-sgraph-access-token`, tokenless reads — **no change** |
| **Null-origin precedent in shipped code** | `sg-embed-frame.js:16,147` (`allow-scripts allow-popups allow-presentation`, no bridge) |
| **CORS code fix** | shipped on `dev` (commit `434106dc`, `allow_credentials=False`) |
| **Node ≥18 in the test runner** | provides `MessageChannel`, `crypto.subtle`, `TextEncoder`/`TextDecoder` — confirmed by the v0.29.2 review |

## What is genuinely "decide during the build" (not blockers)

| Item | Decision needed | Where it lives |
|---|---|---|
| **Self-contained kernel-shell bundle build step** | A small concat script that emits `kernel-shell-bundle.js` (constant `KERNEL_SHELL_HTML`). The dependency order is fixed (see §A.1 below). No new framework — same pattern as `app-shell.js`'s page-layout inline bundling. | Phase 2 §6 |
| **`AppPermissions` extension for `vault.mount`** | Add `vault.mount` (boolean or `string[]` of allowed prefixes) to the parser. One field; add tests; verify the shipped permission tests still pass. | Phase 2 sub-step D |
| **Per-request credential wire shape** | `{ token: string, exp?: number, scope?: string }` carried as an *encrypted* sub-field of the `vfs.write` payload (never in metadata). The child's policy gate is the canonical place to enforce one-time-use. | Phase 2 §3 / 04 §A test row |
| **Trial-side `_resolveChildCredentials(ref)`** | Reads `clinic.json` (parent vault owner record). The schema is the trial team's; this implementation only needs `{ vaultKey, accessToken }` per ref. Document the trial schema alongside the code. | Phase 2 sub-step D |
| **Handshake corner cases** | Init message arrives before responder ready (`srcdoc` fires `load` before any script runs — race is one-shot, port is buffered). Timeout on `ready` → reject the spawn with `EUNREACH`. Concretely: 5s default, configurable. | Phase 1 §6 |

### §A.1 The kernel-shell bundle build script (concrete)

This is the single piece of "new infrastructure" not in the impl pack yet. A trivial Python (or shell) concat that emits one JS module. Add it as `scripts/build-kernel-shell-bundle.py` or inline in the build.

```python
#!/usr/bin/env python3
# scripts/build-kernel-shell-bundle.py — concat the kernel shell into a single self-contained HTML string.
import os, json, sys
ROOT = 'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common'
ORDER = [
    'js/components/app-shell/app-permissions.js',
    'js/components/app-shell/secure-channel-envelope.js',
    'js/components/app-shell/secure-channel.js',
    'js/lib/sg-vault/sg-vault-crypto.js',
    'js/lib/sg-vault/sg-vault-object-store.js',
    'js/lib/sg-vault/sg-vault-ref-manager.js',
    'js/lib/sg-vault/sg-vault-commit.js',
    'js/lib/sg-vault/sg-vault.js',
    'js/lib/sg-vault/sg-vault--file-ops.js',
    'js/lib/sg-vault/sg-vault--folder-ops.js',
    'js/lib/sg-vault/sg-vault--sync.js',
    'js/lib/sg-vault/sg-vault--history.js',
    'js/lib/sg-vault/sg-vault--branches.js',
    'js/lib/sg-send/sg-send-crypto.js',
    'js/lib/sg-send/sg-send.js',
    'js/adapters/vault-data-source.js',
    'js/adapters/composite-data-source.js',
    'js/lib/links/vault-links.js',
    'js/components/app-shell/kernel-mounts.js',
    'js/components/app-shell/kernel-broker.js',
    'js/components/app-shell/kernel-boot.js',
    'js/components/app-shell/kernel-bootstrap.js',     # the one window.message listener that grabs port + accepts SecureChannel
]
scripts = '\n'.join(f'<script>\n{open(os.path.join(ROOT, p)).read()}\n</script>' for p in ORDER)
html = f'<!DOCTYPE html><html><head><meta charset="utf-8">\n{scripts}\n</head><body></body></html>'
out = f'globalThis.KERNEL_SHELL_HTML = {json.dumps(html)};\n'
with open(os.path.join(ROOT, 'js/components/app-shell/kernel-shell-bundle.js'), 'w') as f:
    f.write(out)
print(f'wrote {len(out):,} bytes')
```

Run from repo root as part of the build. Output is loaded as a normal `<script src>` on the `/app` page so `KERNEL_SHELL_HTML` is the global the spawning kernel reads when constructing a child iframe's `srcdoc`.

## What requires real-browser / live-backend verification

These cannot be covered by the jsdom-free unit harness; they're enumerated so they aren't forgotten:

| # | Item | Tool |
|---|---|---|
| **T1** | null child reads `parent.document` → throws | manual / Playwright on the probe page |
| **T2** | null child reads `localStorage` → throws | same |
| **T10** | null-origin GET + PUT to SG/API (CORS round-trip) | `curl` (architect pack §6.6) + real-browser null-iframe |
| **T12** | Monitoring-mode badge visible on vaults page | Playwright |
| **Phase 2 §7 end-to-end** | Real write to a real child vault on `dev`, verified by opening the child directly | Playwright + a real `dev` clinic vault |
| **Phase 3 sub-step E** | Drop `allow-same-origin`; run the probe; all 3 are `BLOCKED` | manual on the probe page |

**Everything else is jsdom-free and fast** — §B catalogues each.

---

# §B · Test catalog — every new assertion, named, no mocks, no patches

**Project rule (CLAUDE.md):** *"All tests use real implementations (in-memory Memory-FS), no mocks or
patches."* Every test in this catalog uses real `crypto.subtle`, real `MessageChannel`, and the actual
shipped modules loaded via `runInThisContext` — same pattern as `test__app_permissions.js`.

**Total target: ~140 named assertions across 6 new test files**, all jsdom-free, expected runtime
< 10 s for the full suite.

## §B.1 `tests/unit/vault_ui/loader/test__secure_channel_envelope.js`

**Module under test:** `secure-channel-envelope.js`. Pure WebCrypto + bytes. Highest test density —
it's the load-bearing module for both isolation and binary fidelity.

| # | Assertion | Maps to |
|---|---|---|
| E1.a | `pack({type:'echo',payload:{x:1},…})` produces an object with `v,cid,dir,type,nonce,ts,payload,enc:false,sig`. | sanity |
| E1.b | Round-trip `pack` → `unpack` with the matching peerSignKey returns `payload === {x:1}` (deep-equal). | sanity |
| E1.c | `unpack` resolved fields equal the originals (`cid`, `dir`, `id`, `type`, `nonce`, `ts`). | sanity |
| E2.a | `pack({…, payload:{x:1}, enc:true, encRecipientPub})` produces `{iv,ct}`-shaped payload bytes, `enc:true`. | sanity |
| E2.b | `unpack` with the recipient's decryptPriv returns the plaintext object. | sanity |
| **E3** | Tamper one byte of the ciphertext → `unpack` throws `Error{code:'EPROTO'}`. | **T5** misroute |
| **E4** | Sign with key A, verify with key B's pub → `unpack` throws `EPROTO`. | **T5** |
| E5.a | `ReplayGuard.check({cid,dir,nonce,ts:now})` first call → no throw. | T6 |
| E5.b | Same call again → throws `EPROTO('nonce reuse')`. | **T6** |
| E5.c | Different `dir` same `nonce` → no throw (per-`(cid,dir)` keying). | T6 |
| **E6** | `ts:now - 5min` → throws `EPROTO('ts out of window')`. | **T6** |
| **E7.a** ★ | Round-trip the PNG signature `Uint8Array.of(0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A)` through `pack`/`unpack` (signed only). Assert the returned payload is a `Uint8Array` and `equal-bytes` to the input. | **B2** |
| **E7.b** ★ | Same with `enc:true`. Encrypted → decrypted bytes match. | **B2** |
| **E8.a** | `encryptBytes(bytes, key, iv)` → `{iv, ct}`; `decryptBytes({iv,ct}, key)` returns the original bytes. | **B2** |
| **E8.b** | Tamper `ct[0]` → `decryptBytes` throws `EPROTO`. | **B2** |
| E9.a | 0-byte payload round-trips (`new Uint8Array(0)`). | edge |
| E9.b | 1-byte payload round-trips. | edge |
| E9.c | 1 MiB random payload round-trips (real, slow-ish but still < 1 s). | edge |
| E10 | Pack from sender A's signKey → unpack with sender B's signPub → `EPROTO` (wrong peer). | T5 |
| **E11** | Two `pack(...)` calls with the same payload but fresh `nonce` produce **different** envelopes (nonces differ); both `unpack` cleanly. | determinism + uniqueness |
| E12 | 1000 generated nonces are all distinct (`Set.size === 1000`). | randomness |
| E13 | `jsonToBytes`/`bytesToJson` round-trip a Unicode string (`"héllo 🌐"`). | sanity |

**~22 assertions.**

## §B.2 `tests/unit/vault_ui/loader/test__secure_channel.js`

**Module under test:** `secure-channel.js`. Uses real `MessageChannel`. No DOM.

| # | Assertion | Maps to |
|---|---|---|
| C1.a | Wire two channels via `new MessageChannel()`. `initiator.request('echo', {x:1})` → responder's `handle('echo')` called with `{x:1}`. | sanity |
| C1.b | Responder returns `{ok:true}`; the initiator's promise resolves to `{ok:true}`. | sanity |
| C2.a | With `sensitive:true`, the handshake completes (both sides hold each other's peerSignPub). | handshake |
| C2.b | `initiator.send('secrets', {vaultKey, token})` → responder's `handle('secrets')` receives the plaintext object. | crypto |
| C2.c | The raw `port.postMessage` payload observed via a sniffer port contains **`enc:true`** and the secret string **does not appear in plaintext** (assert via `JSON.stringify(env).indexOf(vaultKey) === -1`). | confidentiality |
| **C3a** | `responder.request('x', {})` throws `Error('directional: responder cannot initiate requests')`. | **B1** directional |
| **C3b** ★ | `responder.send('ready', {kernelId:'k-b'})` → the initiator's `on('ready', cb)` fires with the payload. | **B1** — handshake path |
| C4 | A second `send('secrets', …)` rejects with `EPROTO` (idempotent boot). | sanity |
| **C5** ★ | **Live binary round-trip:** responder `handle('vfs.read', () => pngBytes)`; `initiator.request('vfs.read', {})` resolves with a `Uint8Array` byte-equal to `pngBytes`. | **T13** / **B2** |
| C6 | Handshake interlock: invoking `initiator.send('secrets', …)` before `accept` finishes on the other side **awaits** the handshake (no race; the secret is delivered after K2 is pinned). | crypto |
| C7 | After handshake, K1 is retired (the initiator's exposed `_K1pub` is `null`); a forged `pki-introduce` signed with a different K1 → `unpack` `EPROTO`. | single-use |
| C8 | `channel.close()` then `channel.request(...)` rejects with `Error{code:'EUNREACH'}`. | lifecycle |
| C9 | Issue 5 concurrent `request(...)` calls with different payloads; each resolves with its own correct response (id correlation). | concurrency |
| C10 | Responder's `handle('x', () => { const e = new Error('nope'); e.code = 'EPERM'; throw e; })` → initiator's `request('x', …)` rejects with `Error{code:'EPERM', message:'nope'}`. | error propagation |
| C11 | Sending an unknown event type with no listeners is silently ignored (no throw, no console.error). | resilience |
| C12 | Two `on('x', f1)` + `on('x', f2)` — both fire on a single `send('x', …)`. | listeners |

**~16 assertions.**

## §B.3 `tests/unit/vault_ui/loader/test__kernel_mounts.js`

**Module under test:** `kernel-mounts.js`. Pure logic.

| # | Assertion |
|---|---|
| M1 | `resolve('mounts/p/data/x.json')` with mount `prefix='mounts/p/'` → `rest === 'data/x.json'`. |
| M2 | `resolve('mounts/p')` → `rest === ''` (the root case — review N1). |
| M3 | `resolve('mounts/p/')` → `rest === ''` (trailing-slash normalisation). |
| M4 | `resolve('local/file.json')` (no mount prefix) → `null`. |
| M5 | **Longest-prefix:** mounts `mounts/p/` AND `mounts/p/deep/`; `resolve('mounts/p/deep/x')` selects `deep/`, `rest === 'x'`. |
| M6 | `resolve('mounts/p/deep')` with only `mounts/p/` → `rest === 'deep'`. |
| M7 | `resolve('/mounts/p/data')` (absolute) → matches and normalises (`rest === 'data'`). |
| M8 | **Traversal collapse:** `resolve('mounts/p/../local/x')` → either `null` (no `local/` mount) or a non-mount path; **does not** escape via `..`. |
| M9 | `add({mountId,prefix:'mounts/p',…})` without trailing slash is stored *with* one (normalisation). |
| M10 | `remove(mountId)` removes the mount; subsequent `resolve` returns `null`. |
| M11 | `list()` returns one entry per mount; order is insertion. |
| M12 | `resolve('')` (empty path) → `null` (no implicit mount-root). |

**~12 assertions.**

## §B.4 `tests/unit/vault_ui/loader/test__kernel_broker.js`

**Module under test:** `kernel-broker.js`. Pure logic (with an injected `ui.prompt` for `ask`).

| # | Assertion | Maps to |
|---|---|---|
| BR1 | Default policy: `fs.read` → `auto`; `fs.write`/`fs.delete`/`fs.mkdir`/`fs.move` → `ask`. | review N3 |
| BR2 | `mediate('read', m, p)` with default → `{decision:'allow', entryId}`; entry recorded with that `entryId`. | review N3 |
| BR3 | `entryId` is unique across two consecutive `mediate(...)` calls (string match fails). | concurrency |
| BR4.a | With `ui={prompt: async()=>'allow'}`, `mediate('write', m, p)` → `'allow'`. | ask path |
| BR4.b | With `ui.prompt → 'deny'`, `mediate('write', m, p)` → `'deny'`. | ask path |
| BR4.c | With no `ui` and `'ask'` policy, `mediate('write', m, p)` → `'deny'` (fail-closed). | ask path |
| BR5 | `setPolicy(m, 'fs.write', 'auto')` → subsequent `mediate('write', m, p)` returns `'allow'` without prompting. | policy override |
| BR6 | `setPolicy(m, 'fs.write', 'never')` → `mediate` returns `'deny'` without prompting. | policy override |
| **BR7** ★ | **Concurrent finalize:** two `mediate('write', m, p)` in flight produce entries `e1` and `e2`; `finalize(e2, 'ok')` then `finalize(e1, 'EPERM')` → `log({mountId:m})[0].result === 'EPERM'` AND `log({mountId:m})[1].result === 'ok'` (closes the correct row by id, not by tuple). | **review N3** |
| BR8 | `finalize('be-nonexistent', 'ok')` is silent (no throw). | resilience |
| BR9 | `log({mountId:'other'})` returns `[]` when nothing recorded for that mount. | filter |
| BR10 | `log()` (no filter) returns entries in insertion order across mounts. | structure |
| BR11 | `BrokerEntry` shape: `entryId, ts, edge, mountId, op, path, credentialClass, policy, decision, result` — every field present. | API |
| BR12 | `mediate` records `credentialClass: 'perRequest-rw'` when called with that value (no logging of the credential itself). | audit hygiene (AppSec §5.1) |

**~12 assertions.**

## §B.5 `tests/unit/vault_ui/loader/test__kernel_relay.js`

**Integration:** real `KernelBroker` + `KernelMounts` + `SecureChannel` + `MessageChannel`. No DOM. We
construct two "kernels" in the same Node process — A holds a mount table + broker + channel to B; B
holds its own handlers. **No `SGVault` for these tests** (a small synthetic in-memory data source
suffices — the goal is exercising the relay machinery, not the vault stack). The end-to-end
SGVault-backed test is the Phase 2 §7 browser check.

| # | Assertion | Maps to |
|---|---|---|
| R1 | Mount B on A (prefix `mounts/b/`); `A.handleVfs('read', { path: 'mounts/b/x.txt' })` → relay → B returns "hello" → A returns "hello" to the caller. | one primitive |
| **R2** ★ | **Binary read across relay:** B returns the PNG bytes; `A.handleVfs('read', { path: 'mounts/b/p.png' })` resolves with a `Uint8Array` byte-equal to those bytes (no `{}` corruption). | **T13** / **B2** |
| **R3** ★ | **Binary write across relay:** `A.handleVfs('write', { path: 'mounts/b/data.bin', data: pngBytes })` → B's `handle('vfs.write')` receives `data` as a `Uint8Array` byte-equal to `pngBytes`. | **T13** / **B2** |
| R4 | Sensitive payloads encrypted: sniff the port traffic between A and B; the bytes of `pngBytes` do not appear in plaintext (the envelope holds `{iv, ct}`). | confidentiality |
| R5 | `vfs.list` on mount root: `A.handleVfs('list', { path: 'mounts/b' })` → relay with `path:''` → B's `listFolder('/')` returns the root entries. | **N1** mount-root list |
| **T7** | B's policy has `fs.write` absent. `A.handleVfs('write', { path: 'mounts/b/data', data: bytes })` → broker prompts (or auto-allow), B refuses → `EPERM`. | **T7** capability |
| **T8** | B has `permissions.fs.write` granting `data/` only. Write to `mounts/b/elsewhere/x` → `EPERM` (child policy refuses). | **T8** two-sided |
| **T9.a** | Inline `credential: 'write-token-A'` on a write — first call succeeds (with B's policy permitting). | per-request |
| **T9.b** | Second write without credential — `EPERM` (no token retained). | **T9** |
| **T3.a** | B-side: `B.parentChannel.request('x', {})` throws `'directional: responder cannot initiate requests'`. | **T3** |
| **T3.b** | B-side: `B.parentChannel.send('ready', {kernelId:'b'})` → A's `on('ready', cb)` fires. | **B1** |
| **T4** | Set up A↔B and B↔C. A has no mount for C. `A.handleVfs('read', { path: 'mounts/c/x' })` → `null` (no mount) → falls through to local; A's broker has no entry for C. C remains unreachable from A. | **T4** not transitive |
| **T11** | In isolation mode, A's stored channel state does NOT include B's private decrypt key; if A captures the B↔C traffic, the bytes are ciphertext (assert via direct byte inspection). | **T11** isolation |
| R12 | Broker entry recorded for each relay; `entryId` round-trips through `mediate` + `finalize`. | audit |
| R13 | Channel teardown: close the A↔B port; `A.handleVfs('read', { path:'mounts/b/x' })` → `EUNREACH`. | lifecycle |

**~14 assertions.**

## §B.6 `tests/unit/vault_ui/loader/test__app_permissions_vault_mount.js`

**Extension to the shipped permission tests.** Adds the new `vault.mount` capability to the existing
`AppPermissions.parse`/`can` (does not break any of the 39 shipped tests).

| # | Assertion |
|---|---|
| VM1 | `parsePermissions({permissions:{vault:{mount:true}}}).vault.mount === true`. |
| VM2 | `parsePermissions({permissions:{vault:{mount:['mounts/']}}})` stores the array. |
| VM3 | `can(perm, 'vault.mount', 'mounts/patient-acme')` with grant `['mounts/']` → `true`. |
| VM4 | `can(perm, 'vault.mount', 'elsewhere')` with grant `['mounts/']` → `false`. |
| VM5 | No `vault.mount` in `app.json` → `can(...) → false` (default-deny for mutate-class). |
| VM6 | All 39 shipped `app-permissions` tests still pass with the new field present. |

**~6 assertions.**

## Total

`22 (envelope) + 16 (channel) + 12 (mounts) + 12 (broker) + 14 (relay) + 6 (permissions extension) =
**82 named assertions across 6 new test files**, all jsdom-free. Add to
`tests/unit/vault_ui/loader/run-all.sh`. Targeted runtime: well under 10 s for the full set (E9.c —
the 1 MiB round-trip — is the slowest at ~200 ms; everything else is < 50 ms each).

Plus the 39 shipped `app-permissions` assertions still pass → **121+ assertions** covering the change
surface, no mocks, no patches.

## What this **doesn't** cover (by design)

- **Real browser isolation** (T1, T2, the probe page): cannot be done in Node; needs Playwright or
  manual. Documented in §A.
- **CORS round-trip** (T10): network; documented as Phase 0.5 operational gate.
- **`SGVault.open` against a live `dev` backend**: needs a real token + a real vault; documented as the
  Phase 2 §7 manual gate.
- **`/vault` HTML view + edit preview unification** (Phase 4): UI integration; tested manually.

These are the items the architect review correctly identified as live-environment gates — separate
from the unit harness.

## How to run

```bash
# from repo root
bash tests/unit/vault_ui/loader/run-all.sh        # the full jsdom-free suite

# or one at a time
node tests/unit/vault_ui/loader/test__secure_channel_envelope.js
node tests/unit/vault_ui/loader/test__secure_channel.js
node tests/unit/vault_ui/loader/test__kernel_mounts.js
node tests/unit/vault_ui/loader/test__kernel_broker.js
node tests/unit/vault_ui/loader/test__kernel_relay.js
node tests/unit/vault_ui/loader/test__app_permissions_vault_mount.js
```

Each file follows the `test__app_permissions.js` pattern (load with `runInThisContext`, simple
`ok`/`eq` assertions, exit non-zero on failure). The runner is `run-all.sh` — add each test on its own
line, in the order above.

---

## Acceptance gate for Phase 1

- All E*, C* assertions pass.
- E7.a/E7.b/C5 explicitly assert byte-exact equality with the PNG signature (the load-bearing tests
  for **review B2** — the binary data path).
- C3a/C3b explicitly assert the precise directional rule (the load-bearing test for **review B1**).

## Acceptance gate for Phase 2

- M*, BR*, R*, VM* assertions pass.
- R2/R3 (binary across the relay) and BR7 (broker concurrent finalize) are explicitly green.
- The Phase 2 §7 browser end-to-end is green (manual / Playwright).

— *catalogue ends here; each row is an assertion to write, not a test method.*
