# 01 — Architecture Review: Vault-in-Vault via the Unified Kernel Primitive

**Pack version** v0.28.7 · **Date** 2026-05-28 · **From** Architect (Explorer team)
**Type** Architecture review (normative) · **Status** PROPOSED
**Supersedes** the relevant parts of `v0.27.79__architect-briefing__viv-isolated-kernel-spawn.md` and folds in `v0.27.79__architect-spec__app-iframe-capabilities-and-permissions.md`.

> This file is the normative design. §02 draws it, §04 specifies the wire, §05 sequences the build. Where any other pack file disagrees with this one, **this one wins** — open an issue rather than reconciling silently.

---

## 1. The one principle

**Accessing data within a vault and accessing data across vaults are the same operation.** There is one access primitive. What differs between "read my own file" and "write a file three vaults deep" is only: the **capability** in play, **what** comes back, and **who** is asking. Never the code path. If you find yourself writing a second mechanism for the cross-vault case, stop — you've left the design.

Everything below is the machinery that makes that one sentence true and safe.

## 2. The unit (stamped fractally)

The only construct is **a kernel bound to one vault, exposing one capability port to one app.**

- **Kernel** — trusted shell code (the platform's `/app` shell). Bound to exactly **one** vault. Holds *that vault's* two secrets (the **vault key** for decrypt and the **access token** for server writes). Owns that vault's **data source**. Runs that vault's **permission checks**. Talks **directly** to the SG/API for its own vault. Runs a **broker** for any children it mounts. Exposes `sg.*` as a capability over a `MessagePort` to its app.
- **App** — the vault's `app.json` HTML, in a **`null`-origin** iframe (`sandbox="allow-scripts"`, *no* `allow-same-origin`). Holds **no** secrets. Has no DOM authority over the kernel, no storage, no ambient `fetch` to the vault. Gets only the `sg.*` port. An app is a **leaf** — unless it itself mounts a child kernel, in which case it becomes a mount point (see §6, scenario 2).

The same shell code is the kernel at **every** level. That is the fractal stamp: ViV, ViViV, ViViViV need *more instances*, never *more code*.

```
Kernel  ──owns──▶ vault secrets · data source · permission policy · SG/API client · broker
  │
  │ exposes sg.* over a MessagePort (capability, never secrets)
  ▼
App  ── null-origin iframe · app.json HTML · no secrets · no storage · no ambient network
```

## 3. The origin model — exactly one real origin

| Vault | Origin? | Why |
|---|---|---|
| **Top-level (host) vault** | **Yes** — it has a URL | Only to bootstrap: read the `#hash` and read `localStorage` (`sg-vault-key`, `sg-backend-access-key`). *Literally that, and nothing else.* |
| **Every nested vault** | **No** (`null`) | Everything it needs is **given to it** by its parent at spawn. It cannot read storage, cannot read its parent's DOM, cannot reach across origins. |

Consequence the implementer must internalise: **a vault can no longer assume it is top-level.** Every kernel must support two boot sources — (a) *origin boot* (read hash + `localStorage`; only the top kernel ever does this), and (b) **message boot** (receive secrets from a parent over a port). Message boot is the new path. A `null`-origin kernel that tries to read `localStorage` will throw `SecurityError` — that is the isolation working, not a bug.

## 4. Directional trust — A→B, never B→A

This is the backbone. The parent **holds the capability** to the child and is the **only initiator**; the child **only ever responds**.

- The parent creates the child's iframe and holds the `MessagePort` to it. That port *is* the capability.
- The child receives a port to talk **back to the parent only as a responder** — it answers on the port it was hard given; it gets **no** handle it can use to *initiate* against the parent, **no** reference to the parent `window`, and cannot enumerate or reach siblings or ancestors.
- Capability flows **down**. A child cannot escalate to its parent. If A mounts B and B mounts C, **A has no implicit reach into C** — capability is not transitive; C is reachable only via a port B chose to expose, and B does not hand A a reference to C.

A nested kernel literally cannot tell "I am embedded under A" from "I am top-level," except that something is talking to it on its one inbound port. That indistinguishability is *why* "a vault works embedded or standalone" is free rather than a special case.

> **Correction to the prior briefing.** `v0.27.79` had the parent console drive the child *app* directly (`App-A → App-B: sgpoc:writeReview`) and had deep kernels proxy server I/O *up to `window.top`*. Both are wrong here: the first is an ambient app-to-app reach that violates this section; the second requires upward `window` reach that does not exist in this model. Both are removed. See §7 for the correct server path and §6 for the correct write path.

## 5. The two edges — keep them separate or the design collapses

There are exactly two kinds of traffic. Conflating them re-centralises the architecture and undoes the whole point.

### Edge 1 — the server edge (kernel ↔ SG/API): direct, per-kernel, unbrokered, identical everywhere

Every kernel — root or nested, at any depth — talks to the SG/API **itself**, with the **same code** (`sg-send.js`, `x-sgraph-access-token` header; reads are tokenless). The broker is **not** in this path. There is **no relay** of server traffic. A nested kernel's `fetch` to `dev.send.sgraph.ai` is a direct request authenticated by the bearer token it was provisioned with at spawn.

This is safe and origin-independent because: auth is a **bearer header**, there are **no cookies** anywhere on the vault path, the data is **public ciphertext** (reads need no token; writes need the write token + the vault key, which the server never sees), and zero-knowledge means CORS was **never** the confidentiality boundary. The *only* thing standing between a `null`-origin kernel and the server today is the CORS misconfig in §06 — fix that and the server edge is uniform at every level, exactly as the project lead requires.

> **The top kernel's sole privilege is its origin** — used once, at bootstrap, to read the hash + `localStorage`. After bootstrap, the top kernel is *the same* as every nested kernel with respect to the server. No kernel is a network broker for any other kernel.

### Edge 2 — the inter-kernel edge (parent kernel → child kernel): brokered, logged, the only relayed path

When an app calls `sg.vfs.read('mounts/patient-acme/data/reviews.json')` and that path **crosses a mount point**, the kernel resolves the local prefix to a mounted child and **relays the request to the child kernel over the inter-kernel port**. The child kernel applies *its own* policy, performs the op against *its own* vault (talking to the server on its *own* server edge — Edge 1), and returns the result. If the child's path itself crosses a further mount, it recurses. This is the only relayed traffic, and it carries a **capability invocation** (verb + path + optional inline credential), **not** network bytes.

**This edge — and only this edge — is what the broker mediates.**

## 6. Mounts: "a linked vault is just an app" — the two scenarios

A mount is a `null`-origin iframe hosting a child kernel, reached by a port. Who holds the child's credentials determines who the caller is — but **the method is identical** (ask for a file over the bridge).

| Scenario | Who holds B's credentials | Who calls B | Broker / enforcement |
|---|---|---|---|
| **1. Kernel A mounts B** (e.g. tree-view link, sub-vault) | **Kernel A** (provisioned B with them) | The request relays **through Kernel A** | **A's per-kernel broker** mediates + logs every A→B invocation. A is the place B's key is known. |
| **2. App A mounts B directly** (App A holds B's creds) | **App A** | **App A** calls B directly | A's *kernel* never held B's creds, so its broker isn't on this edge. Enforcement is **B's own policy** + PKI keeps App A from reading the secrets it relays. |

Scenario 1 is the common, trusted case and the one the per-kernel broker is built for. Scenario 2 covers "the user provides credentials inside an embedded vault" — App A opens B's kernel, the human types B's key into B, and **only B's iframe knows the credential**; A's kernel is deliberately blind to it, which is correct.

The driving use case (KneeScore: console appends a review to a patient vault's `data/reviews.json`) is **Scenario 1, Edge 2**: `sg.vfs.write('mounts/patient-acme/data/reviews.json', review)` on the console app → Kernel A resolves the mount → A's broker logs/authorises → relays to Kernel B → B checks its `fs.write:["data/"]` grant → B writes its own file and pushes on B's own server edge. **No patient app UI is mounted, no app-to-app message, no `window.top`.** The patient *app* is only ever mounted if a human wants to *see* the patient UI.

## 7. The server path is not a design decision anymore

The prior briefing spent its longest section (§6/§6a) choosing between "API accepts `Origin: null`" and "top kernel proxies." Under this model **there is nothing to choose**: each kernel uses its own server edge directly (§5, Edge 1). The relay-vs-proxy question only existed because the prior design assumed `null`-origin frames can't reach the server. They can, once §06 lands. So:

- **No** server-I/O relay. **No** top-kernel network broker. **No** token concentration in the top kernel.
- The single server-side change is the CORS fix (§06), plus verifying CloudFront forwards `Origin` and honours `Vary: Origin` so a cached `Access-Control-Allow-Origin` can't be served to the wrong origin.

## 8. The broker — per-kernel capability-invocation monitor

**One broker per kernel, mediating the children that kernel mounted (Edge 2 only).** It is a **sidecar** inside the kernel, on the kernel's outbound inter-kernel channel — *not* inline in `sg.*`, *not* on the server edge, *not* global.

It does four things, all on the inter-kernel edge:

1. **Mediate** every invocation the kernel makes on a child it mounted (read/write/list/delete crossing into a child).
2. **Log** every such invocation (verb, path, child id, credential class used, result/error) — a complete inter-vault access record *for this kernel's children*.
3. **Authorise** per policy: auto-allow, or prompt the user ("App A asked to write `summary.md` in vault B — authorise? [y/n]"). Policy is per-mount / per-capability.
4. **Expose its log** over the kernel's own capability channel so the **vault-in-vaults page** can aggregate (the page asks *each* kernel for *its* broker log; there is no central collector — that would need a tree-wide view, which violates §4).

Why per-kernel is both simpler and more secure: the broker needs the child's identity/credentials to mediate, and **the only place those are known is the parent kernel that provisioned the child.** Putting the broker anywhere else would require shipping the child's key somewhere it isn't — exactly what we refuse to do. Per-kernel keeps keys where they already are and keeps the topology flat.

## 9. Credentials — standing + per-request elevation, two-sided authority

- **General (standing):** the child holds a standing capability for its lifetime — typically the **minimum**, e.g. read-only.
- **Per-request (elevation):** a higher capability (e.g. a write token) is passed **inline with a single request**, used once, and **not retained** — safe precisely because the platform is **no-storage / ephemeral**; the token does not persist in the child.

**Authority is the intersection of two independent gates:**

```
effective_authority(op) = (parent granted the capability for op)  ∩  (child's own policy permits op)
```

A credential is **necessary, not sufficient**: a child enforces its **own** policy regardless of what credential a caller presents, and **distinguishes a credentialed caller from an uncredentialed one** (uncredentialed → typically nothing or public-read-only; credentialed → per the credential, still bounded by the child's policy). This two-sidedness is what makes "ViV is just an app" safe even when an app holds a child's token (Scenario 2): the token gets the caller in the door, the child's policy decides what happens next.

## 10. PKI on every inter-kernel message

Each vault, on start, has a public/private keypair. Every message on the **inter-kernel edge** (Edge 2) is **signed by the sender** and **encrypted to the recipient** when it carries anything sensitive (secrets, tokens, content).

- **Confidentiality:** only the intended recipient can read it.
- **Integrity / authenticity:** the recipient verifies the sender.
- **Fail-safe misrouting (correctness, not just security):** a message that arrives in the wrong place **cannot be read or executed**. The project lead's point stands — this catches a whole class of routing bugs by making them fail closed instead of executing in the wrong context.

**Scope:** cross-context messages only (the inter-kernel edge, and secret injection at spawn). Same-document `CustomEvent`s have no trust boundary and stay as-is. The local kernel↔app edge is already point-to-point authenticated by the **port** (possessing one endpoint of an entangled `MessageChannel` *is* proof of peer identity), so PKI there is belt-and-suspenders, applied only to the secret-bearing messages.

### Key bootstrap and the monitoring/isolation toggle (D6)

The elegant bootstrap (project lead's preferred): the parent mints a **one-use** keypair and gives it to the child over the creation-time channel; the child uses it to generate **its own** non-extractable keypair and sends **its public key** back up; thereafter they communicate with the child's own keys and the one-use key is retired.

- **Isolation mode — default, production posture:** the parent **never holds the child's private key**. Even the parent cannot read the child's onward (child↔grandchild) traffic. This is what makes directional-trust isolation a *real* boundary rather than advisory.
- **Monitoring mode — debug builds only, must be visible:** the parent retains the ability to read child messages. This **must not** be silently available in production; if on, the **vault-in-vaults page must show it is on** for the affected kernels. (Otherwise "parent can read everything" becomes an invisible bypass of the isolation guarantee — the same advisory-vs-enforced trap as the original same-origin finding, one layer up.)

## 11. Ports, and the single unavoidable `window` touch

Reach between contexts is by **`MessagePort`**, not by `window`/`event.source`/`frames[]`. A kernel holds a small bag of opaque ports — one to its app, one per child it mounted — and has **no name or reference** for anything else in the tree. That is what enforces "each kernel has no idea about the other kernels."

The **one** irreducible `window` touch: a freshly created iframe has no port yet, so its creator must deliver the first `MessagePort` via exactly one `iframe.contentWindow.postMessage(initMsg, '*', [port])` at birth (transferables can only travel by `postMessage`). After that the child lives entirely on its port and never addresses `window` again. Per §4, that bootstrap port is the **parent's** handle to the child; the child answers on a port but receives no handle that lets it initiate against the parent. "No `window`" precisely means "no `window` after a single bootstrap message" — state it that way so an implementer doesn't invent something worse to avoid the one legitimate call.

## 12. What changed and why (delta from the prior implementer briefing)

| Prior briefing (`v0.27.79`) | This review | Reason |
|---|---|---|
| `App-A → App-B` direct `sgpoc:writeReview` | Removed. Driving case is a **transparent `vfs.write` crossing a mount** (Edge 2), relayed kernel→kernel | App-to-app reach is ambient cross-frame reach; violates directional trust (§4). The child writing its own file is the same outcome without the reach. |
| Deep kernels proxy server I/O **up to `window.top`** | Removed. **Each kernel talks to SG/API directly** (Edge 1) | Upward `window` reach doesn't exist in this model; direct-to-top had no unforgeable anchor and concentrated tokens. Direct per-kernel is simpler and uniform (D4). |
| Server path = open decision (Option 1 vs 2, relay shape) | **Not a decision.** One CORS fix (§06) makes direct work | The relay only existed to dodge a CORS misconfig, not a real constraint. |
| Distinct "Kernel-B spawn" construct | **A mount is just an app** hosting a kernel; one primitive | Unification (§1, §6). Removes a special case. |
| `event.source` anchoring as the trust root | **Ports** are the trust root; `event.source`/`window.parent`/`frames[]` removed | Ports give point-to-point authenticated reach by construction (§11). |
| Three iframe contexts (`/app`, `/vault` view, edit preview) handled separately | All three become "an app in a `null` frame with a port to a kernel," differing only by data-source capability | Same machinery; the edit preview's dirty buffer is just one more data-source capability. |

## 13. The standalone-app hardening falls out for free

Making the **standalone `/app` app frame `null`-origin with a secret-less `sg.*` stub** (the fix for `SECURITY-same-origin-app-bypass.md`) is *the same change* as making nested apps `null`-origin. Today the app frame is same-origin (`app-shell.js:923,1037,1094,1174`, all `allow-scripts allow-forms allow-same-origin`) and the permission model is enforced inside `sg.*`, so uncooperative same-origin code bypasses it by reading `localStorage` directly. Under this model the only path to act on a vault is a message the kernel validates, so the permission model becomes a **real boundary even against untrusted app code**. The codebase already proves it can do this: `sg-embed-frame.js:147` mounts untrusted embeds with `allow-scripts allow-popups allow-presentation` — **no `allow-same-origin`, no bridge.** The app-shell simply never got that treatment because it was born trusted. This hardening is the gate for any third-party / bring-your-own vault-app roadmap; it does not block first-party work, but it lands as part of the same refactor (§05 Phase 3).

## 14. Invariants the implementer must not break (checklist)

1. **One primitive.** No second mechanism for the cross-vault case.
2. **One real origin.** Only the top kernel reads hash/`localStorage`; nested kernels message-boot.
3. **Directional trust.** No child reference to a parent; capability never flows up; not transitive.
4. **Two edges, never merged.** Server edge = direct per-kernel, unbrokered. Inter-kernel edge = brokered, the only relay.
5. **Per-kernel broker.** No global broker; broker only on Edge 2; the vault-in-vaults page aggregates by query.
6. **Direct server I/O.** Every kernel hits SG/API itself; no kernel proxies another's network traffic.
7. **Two-sided authority.** Credential ∩ child policy; a credential is necessary, not sufficient.
8. **PKI on inter-kernel messages.** Signed always, encrypted when sensitive; misrouting fails closed.
9. **Isolation by default.** Monitoring mode is debug-only and visible.
10. **Ports, not `window`.** Exactly one bootstrap `postMessage`; nothing else touches `window`/`event.source`.
