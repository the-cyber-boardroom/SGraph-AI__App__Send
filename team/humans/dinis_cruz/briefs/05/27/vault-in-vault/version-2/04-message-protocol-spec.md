# 04 — Message Protocol & API Spec

**Pack version** v0.28.7 · Companion to `01-architecture-review.md` (normative).
This file specifies the wire: the SecureChannel, the message envelope, the `sg.*` capability surface the app sees, the inter-kernel relay, the broker interface, and the capability matrix. Names are proposals; the **shapes** are the contract.

---

## 4.1 SecureChannel — the one cross-context primitive

All cross-context messaging goes through **one** object, not ad-hoc `postMessage`. It collapses today's scattered `postMessage` + `event.source` + reply-id correlation in `app-shell.js` into a single channel abstraction. **Scope: cross-context only** (frame↔frame). Same-document `CustomEvent`s stay as-is.

```js
// ── creator side (parent kernel mounting a child, OR a kernel exposing sg.* to its app) ──
const ch = await SecureChannel.create(iframe, {
  role:    'initiator',
  // the channel does the §02 2.4 handshake; on a secret-bearing channel it also
  // performs the one-use-key → child-keypair exchange before any secret is sent.
});
await ch.send('secrets', { vaultKey, accessToken });   // encrypted to the child's key
const res = await ch.request('vfs.read', { path });    // id-correlated request/response

// ── responder side (the child kernel, after message-boot) ──
const ch = await SecureChannel.accept(port);   // anchors on the PORT it was handed, not window.parent
ch.on('secrets', ({ vaultKey, accessToken }) => kernel.boot(vaultKey, accessToken));
ch.handle('vfs.read', async ({ path }) => kernel.vfs.read(path));  // policy-checked inside
```

Design rules:
- **Anchor is the port, never `window`/`event.source`.** Possession of one entangled `MessagePort` endpoint *is* proof of peer identity. `accept(port)` takes the transferred port from the bootstrap message (§4.3), not `window.parent`. This is the key fix vs. the prior briefing's `accept(window.parent)`.
- **One curve, pinned once.** P-256 is verified-universal; prefer X25519 (ECDH) + Ed25519 (sign) **iff** runtime support is confirmed in the target browsers. Keys **non-extractable** (`extractable:false` in WebCrypto) except the one-use bootstrap key.
- **Directional.** `create` returns the parent's initiating handle; `accept` returns a responder-only handle. A responder can reply to a request and emit events the initiator subscribed to; it **cannot** initiate arbitrary requests upward.
- **Idempotent boot.** `kernel.boot()` must tolerate being called once; a second `secrets` message is rejected.

## 4.2 The message envelope

Every cross-context message is a fixed envelope. **Signed always; encrypted when `sensitive`.**

```jsonc
{
  "v":        1,                       // envelope version
  "cid":      "ch-7f3a…",              // channel id (per parent↔child pair)
  "dir":      "down" | "up",           // down = initiator→responder; up = responder→initiator (replies/events only)
  "id":       "req-0192…",             // request id for request/response correlation (omit for fire-and-forget)
  "type":     "secrets" | "vfs.read" | "vfs.write" | "vfs.list" | "vfs.delete"
            | "vault.mount" | "vault.unmount" | "ready" | "result" | "error" | "event",
  "nonce":    "b64…",                  // anti-replay; monotonic per (cid,dir)
  "ts":       1748400000000,           // ms epoch (replay window + logging)
  "payload":  { /* type-specific; CIPHERTEXT when sensitive */ },
  "enc":      true | false,            // is payload encrypted-to-recipient?
  "sig":      "b64…"                   // signature over (v,cid,dir,id,type,nonce,ts,payload,enc)
}
```

- **`sensitive` ⇒ `enc:true`:** `secrets` (vault key + token), any per-request credential, and any **content** payload (file bytes on read/write — clinical/PHI data). Control metadata (`list` results' names, `result` status, `error` codes) may be signed-only.
- **Misrouting fails closed:** a message whose `sig` doesn't verify against the channel's pinned peer key, or whose `enc` payload can't be decrypted, is **dropped unread and unexecuted** (§01 §10). Log the drop; never best-effort parse.
- **Replay defence:** reject `nonce` reuse per `(cid,dir)` and `ts` outside a small window.

## 4.3 The bootstrap message (the single `window` touch)

```js
// parent, immediately after iframe load — the ONLY window.postMessage in the system
const { port1, port2 } = new MessageChannel();
const initMsg = { type: 'init', cid, mode: 'message-boot' };   // NO secrets here
child.contentWindow.postMessage(initMsg, '*', [port2]);        // transfer port2
// parent keeps port1 = its capability to the child; runs SecureChannel.create over it
```

The child's bootstrap listener is its *only* `window`-level listener, and it self-removes after grabbing `port2`:

```js
window.addEventListener('message', function boot(e) {
  if (e.data?.type !== 'init') return;
  window.removeEventListener('message', boot);   // never listen on window again
  const port = e.ports[0];
  SecureChannel.accept(port).then(/* …handshake, then kernel.boot on 'secrets' */);
}, { once: true });
```

`initMsg` carries **no secret** — secrets only flow after the PKI handshake (§02 2.4), encrypted to the child's own generated key.

## 4.4 The `sg.*` capability surface (what the app sees)

The app frame holds a **secret-less stub**. Every method is a `SecureChannel.request` to the kernel, which runs the permission check and (if the path crosses a mount) relays. The surface is **vault-transparent** — the app cannot tell local from cross-mount from the call shape.

```
sg.vfs.read(path)            → bytes            // tokenless underneath; kernel decrypts
sg.vfs.write(path, data, {credential?})         // credential = optional per-request elevation
sg.vfs.list(path)            → [{name,size,kind,writable}]
sg.vfs.delete(path)
sg.vault.mount(ref, {mode, credential?})  → mountId   // ref = link/pointer to another vault
sg.vault.unmount(mountId)
sg.vault.mounts()            → [{mountId, ref, mode, origin:'null', isolation:'isolated'|'monitored'}]
sg.app.selfPath              // unchanged from today
sg.app.writable              // unchanged from today
sg.broker.log({mountId?})    → [BrokerEntry]    // this kernel's broker only
```

Backwards-compat shim: the shipped `window.sgVault` facade (`app-shell.js:1332`) and the `getFileBytes`/auto-`img.src` helpers (`app-shell.js:1018,1160,1337`) must be re-expressed over this stub so existing first-party apps keep working under `null` origin (see `05` Phase 3 parity list).

### Path resolution (the heart of "one primitive")

```
kernel.vfs.<op>(path):
  (prefix, rest) = longest matching mount prefix in this kernel's mount table
  if no prefix:                      # local to this vault
      check this vault's policy(op, path) ; perform locally ; (server via Edge 1 if needed)
  else:                              # crosses into child `prefix`
      broker.mediate(op, prefix, rest, credential)          # log + maybe authorise (Edge 2)
      childChannel(prefix).request('vfs.'+op, { path: rest, credential })   # relay; recurses in child
```

## 4.5 The inter-kernel relay (Edge 2)

A relayed request is just a `vfs.*` envelope on the parent↔child channel, with `payload` containing the **child-relative** path and any per-request credential (encrypted). The child runs §4.4 resolution again — which is what makes nesting recurse with no extra code. **No server bytes ever travel this edge**; the child hits the server on its own Edge 1.

## 4.6 The broker interface (per-kernel sidecar)

```js
// lives inside each kernel; one instance, mediates the children THIS kernel mounted
broker.mediate(op, mountId, path, credential) → 'allow' | 'deny' | Promise<'allow'|'deny'>
   // consults per-mount/per-capability policy: 'auto' → allow ; 'ask' → prompt → y/n ; 'never' → deny
   // logs the (op, mountId, path, credentialClass, decision, ts) regardless of outcome
broker.log({mountId?}) → [ BrokerEntry ]            // exposed via sg.broker.log for the vaults page
broker.setPolicy(mountId, capability, 'auto'|'ask'|'never')
```

```jsonc
// BrokerEntry
{ "ts": 1748400000000, "edge": "A▶B", "mountId": "m-acme",
  "op": "write", "path": "data/reviews.json",
  "credentialClass": "standing-ro" | "perRequest-rw" | "none",
  "policy": "auto" | "ask", "decision": "allow" | "deny", "result": "ok" | "EPERM" | "…" }
```

Invariants: the broker is **only** on Edge 2; it is **never** consulted for this kernel's own local ops or its own server traffic; there is **no** cross-kernel broker query path other than `sg.broker.log` returning *this* kernel's entries (the vaults page aggregates client-side).

## 4.7 Capability + data-source matrix

| Frame | Origin | Holds secrets | `sg.*` | Server edge | Broker | Data source |
|---|---|---|---|---|---|---|
| Top kernel (`/app`) | **real** | vault key + token (origin-boot) | — (serves it) | **direct** | yes (its children) | its vault |
| App (any level) | null | none | RPC stub | — (via no one; only kernels hit server) | — | via its kernel |
| Mounted kernel (any depth) | null | its vault's key + token (message-boot) | — (serves it) | **direct** | yes (its children) | its vault |
| `/vault` HTML view | null | none | RPC (read) | — | — | vault (read) |
| `/vault` edit preview | null | none | RPC (read) | — | — | **dirty buffer** + vault |

Read the "Server edge" column twice: **every kernel is `direct`; no kernel proxies another's network.** That is D4.

## 4.8 Error codes (uniform across local and relayed ops)

```
EPERM       capability absent OR child policy refuses (two-sided gate; do not distinguish to the app)
ECONSENT    broker 'ask' policy denied by user
ENOENT      path not found
EPROTECTED  .vault/** or root app.json (the floor; unchanged from shipped permission model)
EUNREACH    mount exists but child channel is down (e.g. handshake failed)
EPROTO      envelope failed signature/decrypt — dropped unread (logged as a security event)
```

`EPERM` deliberately does **not** tell the app *which* gate failed (missing capability vs child refusal) — leaking that distinguishes probing. The broker log (operator-side) records the real reason.
