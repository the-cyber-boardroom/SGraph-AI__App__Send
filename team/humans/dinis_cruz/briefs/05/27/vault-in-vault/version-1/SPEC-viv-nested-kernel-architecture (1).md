# ViV (Vault-in-Vault) — nested-kernel architecture spec

**For:** Vault Web team (app-shell / `sg.*` bridge / server CORS)
**Date:** 2026-05-27
**Status:** design converged; core mechanisms **verified live** in a real browser (see §3). One platform decision outstanding (§6).
**See also:** `SECURITY-same-origin-app-bypass.md` (the threat this also closes).

---

## 0. Summary

We need a vault app to open **another vault's app** nested inside it (a parent "console" app → a child vault's app), so the nested app can read/write *its own* vault under *its own* permission grant — without the parent ever writing across the boundary, and without losing the parent's session.

The design is a **recursive nested-kernel model**: the only frame with a real origin is the top kernel the browser loads; every nested kernel and app frame runs at **`null` origin**, is fed its secrets explicitly over an authenticated `postMessage` channel, and is isolated by the browser from its parent, grandparent, and siblings.

**Verified live (§3):** null-origin child execution; `postMessage` + `event.source` secret injection; full isolation (child can't read parent or storage; a grandchild never receives the secret); and a complete **one-use-PKI handshake** (parent-anchored trust → child-generated non-extractable key → confidential secret delivery) running inside a `null` frame via WebCrypto.

**The one open decision (§6):** a `null`-origin frame's `fetch` to the vault API is currently **CORS-blocked** (`Origin: null`). So either the API accepts token-authenticated `Origin: null` requests (Option 1), or nested kernels **proxy** their server I/O through the real-origin top kernel (Option 2). Everything else is confirmed to work.

---

## 1. Motivation

Two problems, **one root cause, one fix.**

**1a. The product need.** A parent "console" app must write into another vault (e.g. append a record to a child vault's `data/…`). Reading across a read-only sub-vault mount already works; writing does not. Every client-side write route fails today, and the clean route — "open the child *app* and let it write its own data" — is blocked because there's **one active vault per browser origin**: opening a second vault's app ("Open as App") *switches* the whole origin's active vault (a navigation), clobbering the parent session.

**1b. The security problem (see `SECURITY-same-origin-app-bypass.md`).** Vault apps today run in a frame that is **same-origin** with the kernel (`sandbox="… allow-same-origin"`). That means app code can bypass the `sg.*` bridge entirely — read the vault key and access token straight out of `localStorage`, walk the DOM, reach `window.parent`. The permission model (`app.json` deny-by- default, `EPROTECTED` floor, etc.) is therefore **advisory for cooperative code and bypassable for untrusted code**. It is a real boundary only if app code is isolated from the origin's secrets.

**Both are the same root cause:** app code shares an origin (and thus secrets and session state) with the kernel. **Both are fixed by the same move:** run app code at a `null` origin with no ambient access to secrets, and deliver capabilities (not credentials) over an authenticated channel. This spec is that move.

---

## 2. The model — recursive nested kernels

```
Kernel-A   /en-gb/app/index.html   — REAL origin (browser-loaded). The ONLY real origin.
                                       Reads its key from #hash / localStorage; bootstraps App-A.
└─ App-A iframe    null origin       — App-A's app.json code (the parent "console" app). Holds the
                                       child vault keys it is entitled to (it is the writer).
                                       Talks to Kernel-A via sg.* (RPC).
   └─ Kernel-B    /en-gb/app/index.html — null origin (sandbox inherits). SAME trusted platform
                                          code as Kernel-A. No key from storage — receives its two
                                          secrets by message from App-A.
      └─ App-B iframe  null origin    — App-B's app.json code (the child vault's app). Talks to
                                        Kernel-B via sg.*. Never sees the key.
```

Key principles:

- **Exactly one real origin.** Only the top kernel (loaded directly by the browser at `/en-gb/app`) has the real vault origin. Every frame created beneath an already-`null` frame is itself `null` — opaque-origin / sandbox flags **inherit downward**. This is by design, not a hazard: nested kernels are credential-less and storage-less by construction.

- **Trust comes from being platform kernel code, not from origin.** A `null`-origin Kernel-B is still the trusted broker for its level — it is the same `/en-gb/app/index.html`. "Trusted kernel" and "null origin" are orthogonal. App code (App-A, App-B) is the untrusted-ish part and is always `null` and always credential-less.

- **The kernel holds secrets; the app frame holds a capability.** Each kernel holds its vault's two secrets and runs the permission checks; the app frame only ever gets the `sg.*` RPC channel. App code can do what it is *authorized* to do (the kernel acts for it) but can never *possess* the means to bypass authorization.

- **The two secrets.** A `null` kernel is credential-less, so it must be fed **both**: (1) the **vault key** (to decrypt), and (2) the **access token** (to authenticate to the server). Neither can come from the ambient context (no storage, no cookies under `null`).

---

## 3. Verified mechanisms (live, real browser)

A standalone harness (`viv-crypto-lab.html`, a dev PoC page run inside a vault app) tested the load-bearing primitives directly, using `srcdoc` + `sandbox="allow-scripts"` to manufacture genuine `null`-origin frames. Results:

| # | Tested | Result |
|---|---|---|
| 0 | Secure context + WebCrypto in top frame | ✅ `isSecureContext:true`, `crypto.subtle` present (despite the dev cert showing "Not Secure") |
| 1 | `null`-origin child executes; `postMessage`+`event.source` secret injection | ✅ child runs (`origin:"null"`), alive→ready→authenticated round-trip works |
| 2 | Isolation: child reads parent? storage? grandchild gets secret? | ✅ `parentDocReadable:false`, `localStorageReadable:false`, grandchild `sawSecret:false` |
| 3 | One-use-PKI handshake end-to-end in a `null` frame | ✅ `K2 non-extractable:true`, K1→K2 signature verifies, child decrypts the secret correctly |
| 4 | `null`-origin `fetch` to vault API with supplied token | ❌ **`TypeError: Failed to fetch`** — CORS blocks `Origin: null` (see §6) |

Caveat on Test 2: the probe also expected a grandchild to be able to `postMessage` to `window.top` (reference reachable cross-origin) and it came back `false`. The security conclusion is unaffected (the grandchild provably never received the secret), but *why* the top was unreachable — grandchild blocked vs. grandchild didn't execute in time — is not yet pinned down. Treat sibling/grandchild non-reachability as **confirmed for the secret**, and "to be firmed up" for the raw `window.top` postMessage path.

So: the crypto, the isolation, and the secret-injection mechanism are **confirmed performable in the constrained (`null`-origin) environment**. The only unproven item is the server network path.

---

## 4. The protocol

### 4a. Kernel boot — a third source for "where is my vault / key"

Today the kernel resolves its vault from `#hash` → `localStorage`. **Add a third source:** an inbound `init` message from the parent carrying the **two secrets**. A nested kernel has no hash key and no storage, so it falls through to this path.

```
resolve vault/key:
  1. #hash on the URL            (unchanged)
  2. localStorage['sg-vault-key']  (unchanged; only the top kernel ever has this)
  3. NEW: an inbound postMessage from the creator carrying { vaultKey, accessToken }
```

The receiving kernel **trusts the sender without identifying it** — it doesn't need to know who the parent is; it is simply being handed its own credentials. (Accepting secrets is not a privilege escalation.) Once fed, a nested kernel behaves **identically** to the top kernel. This is one new branch in the boot path, not a per-level code path.

### 4b. Secret injection — `postMessage` authenticated by `event.source`

We use plain `postMessage` (not `MessageChannel` ports — see note). Trust is anchored on the **window reference**, which is unforgeable: the parent keeps the handle of the frame it created and maps it to a per-child secret.

```js
// PARENT (creator) — pattern verified in Test 1
const frameSecret = new WeakMap();              // Window -> secret
function makeChild(key, token) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');           // => null origin
  const secret = crypto.randomUUID();
  iframe.addEventListener('load', () => {
    frameSecret.set(iframe.contentWindow, secret);
    iframe.contentWindow.postMessage({ type: 'init', secret /*, + PKI bootstrap, see 4c */ }, '*');
  }, { once: true });
  iframe.srcdoc = /* kernel html */;             // or src=/en-gb/app once the kernel supports msg-boot
  document.body.appendChild(iframe);
}
window.addEventListener('message', (e) => {
  const expected = frameSecret.get(e.source);    // e.source is the exact window we created
  if (!expected || e.data?.secret !== expected) return;   // authenticate by source + secret
  // trusted message from that specific child
});
```

```js
// CHILD kernel — accept init ONLY from its direct creator (positional trust)
let SECRET = null;
window.addEventListener('message', (e) => {
  if (e.data?.type === 'init' && e.source === window.parent) { SECRET = e.data.secret; /* ready */ return; }
  if (!SECRET || e.data?.secret !== SECRET) return;         // ignore everything else
  // handle sg.* RPC …
});
```

> **Why `event.source`, not `event.origin`:** under `null` origins every frame's `event.origin` serializes to `"null"`, so origin-based checks are meaningless. The window *reference* is the unforgeable discriminator. (`MessageChannel` ports were the original idea and would also work as a capability, but Test 1 showed plain `postMessage` is sufficient and simpler; ports can be added later if a stronger unforgeable-capability carrier is wanted.)

### 4c. The one-use-PKI handshake (recommended hardening — verified in Test 3)

To make the secret delivery **confidential and tamper-/replay-proof** (not plaintext-in-transit), wrap injection in a one-use-PKI bootstrap. This solves "how does the parent know the child's public key is genuine" via positional trust on the creation-time channel, while keeping the child's long-lived private key **non-extractable and never exposed**.

```
1. Parent generates one-use K1 (ECDSA P-256), keeps K1-public, sends K1-private to the child
   over the creation-time channel (4b). K1's sole job: authenticate the child's first reply.
2. Child generates its own K2 (ECDH P-256, NON-EXTRACTABLE). Exports K2-public, signs it with
   K1-private, returns { K2pub, sig }.
3. Parent verifies sig with K1-public  ->  trusts K2-public (anchored: parent minted K1).
   K1 is now retired (single use).
4. Parent ECDH-derives an AES-GCM key to K2-public, encrypts { vaultKey, accessToken }, sends
   ciphertext. Child decrypts with K2-private (which never left the child).
5. All later control messages are signed (and sensitive ones encrypted); each carries a nonce +
   direction to defeat replay.
```

Result: **two long-lived public keys in play, neither long-lived private key ever exposed across the boundary**; the two vault secrets are ciphertext to everyone except the intended child kernel. WebCrypto cost is negligible here (a few control-plane messages, off the hot path) — confirmed.

**Trust anchor caveat:** PKI secures the *wire*; it does **not** remove the need to deliver K1 uninterceptably at creation. The anchor is "K1 arrived over the channel the parent handed to the frame it just created, before any other code could interpose." Keep the K1 injection at frame creation, before app code runs.

### 4d. Per-kernel identity & message authentication

Each kernel gets a unique `kernelId` (a non-secret correlation/audit label) plus its per-child `secret`/keypair (the capability). A kernel accepts secrets/commands **only** via its own authenticated channel (matching `event.source` + secret, or a valid signature), and **must not** process ambient `window` messages that don't match. This enforces the critical invariant:

> A child kernel's messages must not reach its grandparent, and siblings must not see each other.

A grandchild *can* obtain a `window.top` reference and `postMessage` to it (cross-origin postMessage is allowed), so the top **must authenticate every message** — it does, because a grandchild has neither the right `event.source` mapping nor the secret/key. Isolation is by **authentication, not by reachability.**

### 4e. `sg.*` over the channel

`sg.*` becomes a **secret-less client stub** loaded into the app frame from the server (so apps don't each ship it), whose methods are async RPC over the channel to the kernel. The **kernel** holds the secrets, runs the permission checks, and performs the privileged op. The app frame gets a capability, never a credential. Most of today's `sg.*` surface is already promise-based, so the app-facing change is largely mechanical; the boot path (which today reads the key from storage) is the part that changes.

---

## 5. Isolation properties & threat model

Confirmed (§3) and relied upon:

- **Child cannot read its parent.** `window.parent.document` access throws cross-origin (`parentDocReadable:false`). ✅
- **Child has no ambient storage.** `localStorage` access throws under `null` (`localStorageReadable:false`) — so a child **cannot** read or clobber the origin's `sg-vault-key` (this also makes the current session-clobbering bug structurally impossible). ✅
- **Grandchild / sibling cannot obtain the secret.** A grandchild never receives the parent→child secret (`grandchildSawSecret:false`); each child has only its own channel. ✅
- **Cross-child isolation is topological.** The parent console may hold many child vault keys, but each child kernel is scoped to exactly one vault; a child has no channel that reaches another child's vault. (One-parent-many-children leakage is prevented by construction.)

Boundaries of the guarantee:

- PKI secures the **wire** between frames; frame **isolation** keeps keys out of untrusted frames. Both are needed — neither substitutes for the other.
- **Same-frame compromise is out of scope:** if untrusted code ever runs *in the same frame as a kernel's key*, non-extractability stops exfiltration of the key but not its *use* while resident. The architecture's premise is that untrusted app code is always in a *different* (`null`) frame from the kernel holding the keys. Keep that invariant.

---

## 6. The server path — THE decision (Test 4)

A `null`-origin frame's `fetch` to the vault API is **CORS-blocked today** (`Origin: null` → `TypeError: Failed to fetch`). A nested `null` kernel therefore cannot talk to the server directly as-is. Two ways forward:

**Option 1 — server accepts token-authenticated `Origin: null`.** Make the vault API authorize on the supplied access token alone and return an appropriate `Access-Control-Allow-Origin` for `Origin: null` (token-bearing) requests. Then a nested kernel is fully self-sufficient (holds both secrets, does its own commits).
- *Pros:* simplest topology; each kernel is self-contained.
- *Cons:* requires an API/CORS change; **AppSec must scope it** — *any* sandboxed frame anywhere sends `Origin: null`, so "allow `Origin: null`" must be gated strictly on a valid token, never ambient. Needs sign-off.

**Option 2 — the top (real-origin) kernel proxies server I/O.** Nested `null` kernels never `fetch` directly; they send their intended server operation **up** the authenticated channel, and a real-origin ancestor performs the request and returns the result. The nested kernel still holds its vault key for *decryption*; only the *network* is relayed.
- *Pros:* **no platform/CORS change**; only one origin ever talks to the server (cleaner CORS posture); fits the broker model.
- *Cons:* a relay chain (B-kernel → A-kernel → server); the relay must be capability-scoped so a child can't ask an ancestor to act outside its vault.

**Recommendation:** ship **Option 2** first (no platform change, works with everything verified above), and adopt **Option 1** later as a simplification *if/when* AppSec is comfortable allowing scoped, token-authenticated `Origin: null`. The spec is written so either can be implemented without changing the rest.

---

## 7. Platform changes required (the actual asks)

1. **Kernel: message-sourced boot (§4a).** Teach `/en-gb/app/index.html` to resolve its vault from an inbound `init` message carrying `{ vaultKey, accessToken }`, in addition to `#hash` / `localStorage`. This is the central enabling change.
2. **Kernel: secret-injection handshake (§4b/4c).** Implement the `postMessage` + `event.source` injection, ideally with the one-use-PKI wrapper. Deliver the bootstrap at frame creation, before app code runs.
3. **Bridge split (§4e).** Separate `sg.*` into a secret-less client stub (in the app frame) and the secret-holding broker (in the kernel), talking over the channel. Move the **enforcing** permission checks to the kernel/server (never the stub).
4. **Server path (§6).** Implement Option 2 (parent-kernel proxy) — or Option 1 (server accepts token-authed `Origin: null`) if preferred and AppSec-approved.
5. **Confirm origin/sandbox behaviour end-to-end** in the *real* app-shell (the lab proved the raw primitives via `srcdoc`; confirm the same when the child is an actual `/en-gb/app` kernel — esp. that sandbox inheritance keeps nested kernels `null` and that they can still load their own code).

---

## 8. Implementation phasing

- **Phase 0 (today, interim):** all app code is first-party, same-origin. The permission model is enforced by cooperation only. Acceptable *only* while no untrusted/third-party vault apps exist.
- **Phase 1:** kernel message-sourced boot (§4a) + plain `postMessage`/`event.source` injection (§4b) + Option 2 server proxy (§6). Unlocks ViV (parent→child write via the nested child app) and removes session-clobbering. Minimal crypto.
- **Phase 2:** add the one-use-PKI handshake (§4c) for confidential, tamper-proof secret delivery; add `kernelId` + signed control messages (§4d).
- **Phase 3 (hardening):** split the bridge into stub+broker (§4e) so the permission model becomes a real boundary against untrusted app code (closes `SECURITY-same-origin-app-bypass.md`). Optionally move to Option 1 server path.

---

## 9. Key custody (product decision, noted — not blocking)

In the parent→child case, *something* must hold the child's two secrets. Two shapes:

- **Shared (parent-side) broker:** the parent console holds all children's keys (e.g. in a parent-vault record) and feeds each child kernel. Simplest. The per-child channels keep children isolated from each other regardless.
- **Per-child custody (ZK-clean):** the parent never holds child keys; each child key is child-generated, or server-minted and delivered out-of-band. Stronger; needs a provisioning story. Decide before sensitive production data.

This choice doesn't change the mechanism in §4 — only where the secrets originate.

---

## 10. Open questions / still to verify

1. **Server path:** Option 1 vs Option 2 (§6) — needs the team's call (and AppSec for Option 1).
2. **Real-kernel nesting:** confirm in the actual app-shell that a nested `/en-gb/app` is `null` (sandbox inheritance) and can load its own kernel code there; the lab proved the `srcdoc` primitive, not the real kernel-in-kernel load.
3. **Grandchild `window.top` reachability** (Test 2 caveat): confirm whether non-reachability is enforced or incidental. Doesn't affect the secret-isolation guarantee.
4. **WebCrypto curve:** P-256 (ECDSA/ECDH) used and verified; confirm it's the team's standard (Ed25519/X25519 are cleaner but support has lagged historically).

---

## Appendix — message reference (illustrative)

```
parent -> child   { type:'init', secret, k1priv }                         // boot + PKI bootstrap
child  -> parent  { type:'alive', caps }                                  // diagnostic: child executes
child  -> parent  { type:'ready', secret, k2pub, sig }                    // PKI introduce + ready
parent -> child   { type:'secrets', secret, ephPub, iv, ct }             // encrypted { vaultKey, accessToken }
app    -> kernel  { type:'sg.vfs.write', id, secret, path, data }        // sg.* RPC (capability)
kernel -> app     { type:'result', id, secret, result | error:'EPERM' }  // permission-checked
child  -> parent  { type:'server', id, secret, op, … }                   // Option 2: proxied server I/O
```

**Lab:** `viv-crypto-lab.html` — a dev PoC page run inside a vault app via "Open as App". It is the reproducible evidence for §3 and re-runnable as the platform changes.
