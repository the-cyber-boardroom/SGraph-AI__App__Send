# Phase 1 — SecureChannel module (foundation)

**Pack version** v0.28.7 · **Audience** the agent building the SecureChannel.
**Authoritative spec:** [`04-message-protocol-spec.md`](../../../../../../humans/dinis_cruz/briefs/05/vault-in-vault/version-2/04-message-protocol-spec.md) §4.1–4.3 + §4.8 (error codes).
**Goal of this phase:** ship a port-anchored, PKI-protected authenticated channel as a standalone,
unit-tested module. No UI changes, no `app-shell.js` changes yet — this is the foundation Phase 2
plugs into.

## 0. Definition of done

- New module `app-shell/secure-channel.js` exposing `globalThis.SecureChannel`.
- `tests/unit/vault_ui/loader/test__secure_channel.js` green, including the adversarial cases T5
  (misroute / bad signature) and T6 (replay) from version-2 §5.3.
- Module is **standalone** — does not import or depend on `app-shell.js` or any UI code.
- Module is **jsdom-free** for the pure-logic tests (envelope, signing, replay-guard); the handshake
  test uses Node's `MessageChannel`/`Worker`-style isolation, not jsdom.

## 1. File layout

```
sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/
  secure-channel.js          ← NEW. The public module. Sets globalThis.SecureChannel.
  secure-channel-envelope.js ← NEW. Pure envelope (sign/verify/encrypt/decrypt) — fully unit-testable.

tests/unit/vault_ui/loader/
  test__secure_channel.js    ← NEW. Mirrors test__app_permissions.js style.
```

Splitting envelope from channel is what makes T5/T6 cleanly unit-testable without spinning up real
ports — the envelope module is pure WebCrypto + bytes.

Load order in `en-gb/app/index.html` (add after `app-permissions.js`, before `app-shell.js`):
```html
<script src="/_common/js/components/app-shell/secure-channel-envelope.js"></script>
<script src="/_common/js/components/app-shell/secure-channel.js"></script>
```

## 2. The public API (version-2 §4.1)

```js
// Initiator side (parent → child). Pass the iframe and the bootstrap-message port author plan
const channel = await SecureChannel.create(iframeOrPort, {
  role:         'initiator',
  cid:          'ch-7f3a…',            // channel id, opaque, generated if omitted
  sensitiveKey: true,                  // performs the one-use-K1 + child-K2 PKI handshake before sending secrets
});

// Send a fire-and-forget event (signed; encrypted iff sensitive)
await channel.send('event-type', { ... payload ... }, { sensitive: false });

// Send a request and await a correlated reply
const result = await channel.request('vfs.read', { path }, { sensitive: true });

// Receive (responder mode) — register a handler
channel.handle('vfs.read', async ({ path }) => /* … */);

// Receive events
channel.on('event-type', (payload) => /* … */);

// Close the channel; subsequent send/request reject with EUNREACH
channel.close();
```

**Responder side** (child kernel after message-boot):
```js
// Take the port that arrived on the bootstrap message
const channel = await SecureChannel.accept(port, { role: 'responder' });
channel.handle('secrets', ({ vaultKey, accessToken }) => kernel.boot(vaultKey, accessToken));
channel.handle('vfs.read', async ({ path }) => kernel.vfs.read(path));
```

Design rules baked into the implementation:
- **Anchor = the port**, never `window`/`event.source`/`window.parent` (version-2 §4.1).
- **Directional**: `create` returns an initiator handle (can `request`); `accept` returns a responder
  handle (can `handle` + reply). A responder **cannot** initiate arbitrary requests upward — `channel.request`
  on a responder throws `Error('directional: responder cannot initiate')`.
- **Idempotent secret delivery**: handler for `secrets` is one-shot; the channel rejects a second `secrets`
  message with `EPROTO`.
- **Non-extractable child key** (`extractable: false` in WebCrypto), except the one-use bootstrap key K1.

## 3. The envelope (version-2 §4.2)

`secure-channel-envelope.js` exposes a pure `Envelope` object:

```js
globalThis.Envelope = {
  // pack(opts) → { bytes:Uint8Array, sig:string }  — opts has v,cid,dir,id,type,nonce,ts,payload,enc
  async pack({ v=1, cid, dir, id=null, type, nonce, ts=Date.now(), payload, enc=false, signKey }) { … }

  // unpack(bytes, { peerSignKey, decryptKey? }) → { v, cid, dir, id, type, nonce, ts, payload, enc }
  // Throws Error with .code = 'EPROTO' on bad sig OR failed decrypt.
  async unpack(bytes, { peerSignKey, decryptKey }) { … }

  // Helpers
  async generateSignKeypair() { /* P-256 ECDSA, extractable false (pub extractable true) */ }
  async generateEphemeralBootKey() { /* P-256 ECDSA, K1 — sign-only, ONE-USE, extractable true (private exported once) */ }
  async deriveEncKey(senderPriv, recipientPub) { /* ECDH P-256 → AES-GCM key, non-extractable */ }
  async encryptPayload(jsonObj, encKey, iv)    { /* returns { iv, ct } */ }
  async decryptPayload({ iv, ct }, encKey)    { /* returns jsonObj or throws EPROTO */ }
};
```

Wire format = JSON-serialised envelope as a `Uint8Array` (`TextEncoder().encode(JSON.stringify(env))`),
because `MessageChannel` can carry it cheaply and it's easy to log/inspect.

> **Curve note** (version-2 §5.7.1): P-256 is verified-universal. Use ECDSA P-256 for sign and ECDH P-256
> for key agreement. Switching to X25519/Ed25519 is a Phase 6 optimisation; do **not** start there.

## 4. The handshake (version-2 §02 §2.4)

The PKI handshake runs **inside** `SecureChannel.create({sensitiveKey: true})` and the matching
`SecureChannel.accept`. Sequence (numbers from §02 2.4):

```
INITIATOR (parent)                                    RESPONDER (child)
1. (already-true precondition) you hold a MessagePort to the child
3. mint K1 (one-use, ECDSA P-256, sign-only)
   send { type:'pki-bootstrap', K1.priv } over the port (signed by NOTHING yet —
     authenticated by the port itself: possessing the port endpoint = peer identity)
                                                       │ receives K1.priv
                                                       4. mint OWN keypair K2
                                                          (ECDSA P-256 for sign, NON-EXTRACTABLE)
                                                       5. signs K2.pub with K1.priv,
                                                          sends { type:'pki-introduce', K2.pub, sig }
6. verify(sig, K1.pub, K2.pub) → trust K2.pub. RETIRE K1.
7. (later, when send('secrets', …) is called)
   mint own keypair J2 for ECDH with K2 — derive AES-GCM key —
   encrypt payload → send envelope { enc:true, ct, iv, sig }
                                                       8. decrypt with own K2.priv-derived key
                                                          deliver payload to handler
```

After the handshake both sides hold each other's **sign public keys**. Every subsequent envelope is
signed by the sender and verified by the recipient against the pinned peer pub key. The encryption key
for sensitive payloads is derived per-message via ECDH from ephemeral keypairs (forward secrecy).

> **Why K1 instead of just trusting the port:** the port alone is point-to-point authenticated by
> construction, but K1 lets a *future* third party (e.g. another kernel reached via port transfer)
> verify that a message originated from the initiator without holding the port itself. For Phase 1 this
> is belt-and-suspenders; it becomes load-bearing in Phase 5 (`Kernel-B ↔ window.top` direct channel,
> mediated by the spawning kernel at birth).

## 5. Anti-replay (version-2 §4.2)

```js
class ReplayGuard {
  constructor(window = 60_000) { this._seen = new Map(); this._window = window; }
  check({ cid, dir, nonce, ts }) {
    const now = Date.now();
    if (Math.abs(now - ts) > this._window) throw codeError('EPROTO', 'ts out of window');
    const key = `${cid}|${dir}|${nonce}`;
    if (this._seen.has(key)) throw codeError('EPROTO', 'nonce reuse');
    this._seen.set(key, now);
    // GC: drop entries older than 2× the window
    for (const [k, t] of this._seen) if (now - t > 2 * this._window) this._seen.delete(k);
  }
}
```

`nonce` is `crypto.getRandomValues(new Uint8Array(16))` base64-encoded. Each side maintains an outgoing
counter (or random nonce) AND keeps a `ReplayGuard` for incoming.

## 6. Implementation skeleton — `secure-channel.js`

```js
(function () {
  'use strict';

  function codeError(code, msg) { const e = new Error(msg); e.code = code; return e; }

  class SecureChannel {
    constructor({ port, role, cid, peerSignPub, ownSignPair }) {
      this._port = port;
      this._role = role;                              // 'initiator' | 'responder'
      this._cid  = cid;
      this._peerSignPub = peerSignPub;
      this._ownSignPair = ownSignPair;
      this._handlers    = new Map();                  // type → fn(payload, ctx)
      this._listeners   = new Map();                  // event type → Set<fn>
      this._pending     = new Map();                  // request id → {resolve, reject}
      this._replay      = new ReplayGuard();
      this._closed      = false;
      this._port.onmessage = (e) => this._onMessage(e.data);
      this._port.start && this._port.start();
    }

    static async create(iframeOrPort, opts = {}) {
      // 1. Get/derive a port: if given an iframe, create MessageChannel and post init.
      const port = iframeOrPort instanceof MessagePort
        ? iframeOrPort
        : await SecureChannel._bootstrapFromIframe(iframeOrPort, opts);
      // 2. Run the PKI handshake if sensitiveKey requested. Result: pinned peerSignPub.
      const { peerSignPub, ownSignPair } = opts.sensitiveKey
        ? await SecureChannel._handshakeInitiator(port)
        : { peerSignPub: null, ownSignPair: await Envelope.generateSignKeypair() };
      return new SecureChannel({ port, role: 'initiator', cid: opts.cid || randCid(), peerSignPub, ownSignPair });
    }

    static async accept(port, opts = {}) {
      const { peerSignPub, ownSignPair } = opts.expectSensitive ?? true
        ? await SecureChannel._handshakeResponder(port)
        : { peerSignPub: null, ownSignPair: await Envelope.generateSignKeypair() };
      return new SecureChannel({ port, role: 'responder', cid: opts.cid || randCid(), peerSignPub, ownSignPair });
    }

    async send(type, payload, { sensitive = false } = {}) {
      if (this._closed) throw codeError('EUNREACH', 'channel closed');
      const env = await Envelope.pack({
        cid: this._cid, dir: this._dir('out'), type,
        nonce: randNonce(), payload, enc: sensitive,
        signKey: this._ownSignPair.privateKey,
        encRecipientPub: sensitive ? this._peerSignPub : null,
      });
      this._port.postMessage(env);
    }

    async request(type, payload, opts = {}) {
      if (this._role !== 'initiator') throw codeError('EPROTO', 'directional: responder cannot initiate');
      const id = randId();
      return new Promise(async (resolve, reject) => {
        this._pending.set(id, { resolve, reject });
        try {
          const env = await Envelope.pack({
            cid: this._cid, dir: 'down', id, type,
            nonce: randNonce(), payload, enc: !!opts.sensitive,
            signKey: this._ownSignPair.privateKey,
          });
          this._port.postMessage(env);
        } catch (err) { this._pending.delete(id); reject(err); }
      });
    }

    handle(type, fn) { this._handlers.set(type, fn); }
    on(type, fn)     { if (!this._listeners.has(type)) this._listeners.set(type, new Set()); this._listeners.get(type).add(fn); }
    close()          { this._closed = true; try { this._port.close(); } catch (_) {} }

    async _onMessage(env) {
      // Verify sig + replay-guard. On failure: drop unread + log EPROTO.
      let msg;
      try {
        msg = await Envelope.unpack(env, { peerSignKey: this._peerSignPub, decryptKey: this._ownSignPair.privateKey });
        this._replay.check(msg);
      } catch (err) {
        // T5: misroute / forged sig → drop unread, log EPROTO. Never best-effort parse.
        console.warn('[secure-channel] dropped envelope', err.code || 'EPROTO', err.message);
        return;
      }
      // Dispatch: result (resolves a pending request), or handler/listener.
      if (msg.type === 'result' && msg.id && this._pending.has(msg.id)) {
        const { resolve, reject } = this._pending.get(msg.id);
        this._pending.delete(msg.id);
        msg.payload.error ? reject(codeError(msg.payload.error.code, msg.payload.error.message)) : resolve(msg.payload.value);
        return;
      }
      if (this._handlers.has(msg.type)) {
        const fn = this._handlers.get(msg.type);
        try {
          const value = await fn(msg.payload, { cid: msg.cid, ts: msg.ts });
          if (msg.id) await this._reply(msg, { value });
        } catch (err) {
          if (msg.id) await this._reply(msg, { error: { code: err.code || 'EPROTO', message: err.message } });
        }
        return;
      }
      if (this._listeners.has(msg.type)) {
        for (const fn of this._listeners.get(msg.type)) { try { fn(msg.payload); } catch (_) {} }
      }
    }

    _dir(direction) { return this._role === 'initiator' ? (direction === 'out' ? 'down' : 'up') : (direction === 'out' ? 'up' : 'down'); }
    async _reply(reqMsg, payload) { /* pack { type:'result', id:reqMsg.id, dir:'up', payload } and post */ }

    static async _bootstrapFromIframe(iframe, opts) { /* see §7 below */ }
    static async _handshakeInitiator(port) { /* §4 sequence */ }
    static async _handshakeResponder(port) { /* §4 sequence */ }
  }

  function randCid()    { return 'ch-' + cryptoRandHex(8); }
  function randId()     { return 'req-' + cryptoRandHex(8); }
  function randNonce()  { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))); }
  function cryptoRandHex(n) { return Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2,'0')).join(''); }

  globalThis.SecureChannel = SecureChannel;
})();
```

The `Envelope` module mirrors §3 above and is the part **fully unit-testable** without ports — pure
WebCrypto + bytes. Most of the adversarial test surface (T5, T6) lives here.

## 7. The one `window` touch (version-2 §4.3)

`_bootstrapFromIframe` is the only function in the entire system that calls `iframe.contentWindow.postMessage`:

```js
static async _bootstrapFromIframe(iframe, opts) {
  // Wait for the iframe to be ready to receive (load fired). `srcdoc` iframes fire load fast.
  if (iframe.contentWindow == null) await new Promise(r => iframe.addEventListener('load', r, { once: true }));
  const { port1, port2 } = new MessageChannel();
  const initMsg = { type: 'init', cid: opts.cid, mode: 'message-boot' };  // NO secrets here
  iframe.contentWindow.postMessage(initMsg, '*', [port2]);                // transfer port2 (the ONE window touch)
  return port1;
}
```

And in the child (kernel) — its **only** `window`-level listener, self-removing after grabbing port2:

```js
// child bootstrap (lives in the child kernel shell)
window.addEventListener('message', function boot(e) {
  if (e.data?.type !== 'init') return;
  window.removeEventListener('message', boot);     // never listen on window again
  const port = e.ports[0];
  SecureChannel.accept(port).then(ch => kernel.attachParentChannel(ch));
}, { once: true });
```

> **Do not** add any other `window.addEventListener('message', …)` in any kernel-side code. That listener
> is removed in Phase 3; see [03-PHASE-3](./03-PHASE-3-null-app-and-bridge-split.md).

## 8. Tests (`tests/unit/vault_ui/loader/test__secure_channel.js`)

Use Node's built-in `MessageChannel` (available in Node ≥ 15). Pattern is exactly
`test__app_permissions.js`:

```js
import { readFileSync }     from 'node:fs';
import { fileURLToPath }    from 'node:url';
import { runInThisContext } from 'node:vm';

// load envelope + channel into globalThis
for (const f of [
  '_common/js/components/app-shell/secure-channel-envelope.js',
  '_common/js/components/app-shell/secure-channel.js',
]) {
  const p = new URL('../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/' + f, import.meta.url);
  runInThisContext(readFileSync(fileURLToPath(p), 'utf8'), { filename: f });
}
const { SecureChannel, Envelope } = globalThis;
```

Mandatory tests (mapping to version-2 §5.3):

| # | Test | Maps to |
|---|---|---|
| **E1** | `Envelope.pack/unpack` round-trip (signed-only) | sanity |
| **E2** | Pack with `enc:true`, unpack with the recipient's key → returns the payload | sanity |
| **E3** | Tampered ciphertext → `unpack` throws `Error{code:'EPROTO'}` | **T5** (misroute / bad sig fail-closed) |
| **E4** | Wrong peerSignKey → `unpack` throws `EPROTO` | **T5** |
| **E5** | `ReplayGuard.check` accepts unique nonces; rejects reused nonce with `EPROTO` | **T6** (replay) |
| **E6** | `ReplayGuard.check` rejects `ts` outside the window with `EPROTO` | **T6** |
| **C1** | Two `SecureChannel` instances wired via a `new MessageChannel()` (initiator + responder, non-sensitive mode). `initiator.request('echo', x)` → responder's `handle('echo', …)` returns the payload, initiator resolves with it. | sanity |
| **C2** | As C1 but `sensitive: true` — handshake (K1/K2) completes, secrets payload round-trips encrypted. | handshake + crypto |
| **C3** | Responder calls `channel.request` → throws `'directional: responder cannot initiate'`. | directional invariant (version-2 §4.1) |
| **C4** | A second `secrets` message is rejected (`EPROTO`). | idempotent boot (version-2 §4.1) |

Aim for ~25 assertions total. Add to `tests/unit/vault_ui/loader/run-all.sh`.

## 9. Commit & push

```
feat(secure-channel): Phase 1 — port-anchored SecureChannel module + envelope (PKI, replay guard)

- secure-channel-envelope.js: pure pack/unpack, ECDSA P-256 sign, ECDH-AES-GCM encrypt,
  ReplayGuard with ts-window + per-(cid,dir) nonce set, fail-closed unpack.
- secure-channel.js: initiator/responder, MessageChannel-anchored handshake (K1 → K2),
  directional invariant, idempotent secret delivery, the ONE iframe.postMessage bootstrap.
- N jsdom-free unit assertions cover T5 (misroute fail-closed) and T6 (replay) plus the
  envelope/channel round-trips.
- No app-shell.js changes yet. Phase 2 wires this in.
```

After commit, `git push -u origin claude/<your-session-id>`.

## 10. Hand-off to Phase 2

Phase 2 uses `SecureChannel` in three places:
1. **Kernel ↔ App**: today's bridge inside one frame becomes `SecureChannel.accept(port)` on the app
   side and `SecureChannel.create(port, {sensitiveKey: false})` on the kernel side (port from a
   `new MessageChannel()` the kernel makes when it mounts its app). The local edge doesn't need
   `sensitive`-mode crypto by default; the port itself is the authenticator.
2. **Kernel-A ↔ Kernel-B (spawn)**: `_bootstrapFromIframe` is the bootstrap; `sensitive:true` because
   `secrets` flows. This is the primary path.
3. **Future (Phase 5+)**: kernel→`window.top` direct channels for the broker UI — mediated by the
   spawning kernel at birth via port transfer.

Make sure the Phase 1 commit is green before starting Phase 2 — Phase 2 has nowhere to go if the
channel isn't trustworthy.
