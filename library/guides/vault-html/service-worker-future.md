# Service Worker as the future vault VFS layer

This document captures the design for a future architectural upgrade of the vault iframe runtime. It is **not** the current implementation — the [authoring guide](./AUTHORING.md) describes today's contract. This doc explains why a Service Worker is the right next step, what it would unlock, and the trade-offs involved.

> **Status:** proposed / future. No code in this direction has been written yet. Recorded here so the option is captured rather than re-derived.

---

## What we have today

Vault HTML files render inside an iframe loaded from a `blob:` URL. A bridge `<script>` is injected into the iframe's `<head>` at render time and:

1. Patches `window.fetch` to route relative URLs through `postMessage` to the parent.
2. Patches `HTMLImageElement.prototype.src` setter so JS-driven `img.src` assignments resolve against the vault.
3. Runs a `MutationObserver` that re-routes `<img>` tags found in initial markup through the patched setter.
4. Intercepts anchor clicks and asks the parent to re-render the iframe with new HTML.
5. Exposes `window.sg.{vfs,loadCss,loadJs,app}` as the runtime API.

This works for everything that goes through a JS API. It does **not** work for declarative resources the HTML/CSS/module parsers fetch before our JS runs:

- `<link rel="stylesheet" href="...">`
- `<script src="...">`
- `<iframe src>`, `<source src>`, `@import url()`, dynamic `import()`, `new Worker(...)`

That's why authors must use `sg.loadCss` / `sg.loadJs` — see the [authoring guide](./AUTHORING.md).

---

## Why a Service Worker fixes the gap

A Service Worker scoped to the vault origin (`vault.sgraph.ai`, `dev.vault.sgraph.ai`, etc.) intercepts **every** network request the browser makes within its scope — including the declarative ones. The browser routes those requests through the SW's `fetch` event before it would have hit the network.

If we change the iframe `src` from `blob:...` to a real URL under a path prefix the SW owns — for example `/__sg-vfs/<vault-id>/<path>.html` — every relative resource reference inside that page resolves to a sibling URL under the same prefix:

| Author writes | Browser fetches | SW intercepts? |
|---|---|---|
| `<link rel="stylesheet" href="theme.css">` | `/__sg-vfs/<id>/theme.css` | ✅ yes |
| `<script src="helper.js">` | `/__sg-vfs/<id>/helper.js` | ✅ yes |
| `<img src="photo.png">` | `/__sg-vfs/<id>/photo.png` | ✅ yes |
| `<iframe src="other.html">` | `/__sg-vfs/<id>/other.html` | ✅ yes |
| `@import url("base.css")` | `/__sg-vfs/<id>/base.css` | ✅ yes |
| `import('./mod.js')` | `/__sg-vfs/<id>/mod.js` | ✅ yes |
| `new Worker('w.js')` | `/__sg-vfs/<id>/w.js` | ✅ yes |
| `fetch('cities.json')` | `/__sg-vfs/<id>/cities.json` | ✅ yes |

**Every** declarative pattern that fails today becomes a normal HTTP request that the SW can answer with vault bytes. No string mangling. No `</script>` escape edge cases. No `data:` URI inflation.

---

## How the SW would work

### Components

```
┌─────────────────────────┐                ┌────────────────────────┐
│ vault.sgraph.ai (page)  │                │ Service Worker         │
│  - holds vault data in  │ ◄── postMessage─┤  - handles fetch event│
│    memory (decrypted)   │ (request bytes) │  - returns Response  │
└─────────────┬───────────┘                └────────────────────────┘
              │                                      ▲
              │ embeds                               │ intercepts every
              ▼                                      │ request from iframe
┌─────────────────────────┐                          │
│ <iframe src="/__sg-vfs/ │  ◄───────────────────────┘
│ <id>/index.html">       │   request /__sg-vfs/<id>/style.css
└─────────────────────────┘
```

1. **Registration.** When the vault page loads, register the SW at scope `/__sg-vfs/`. Wait for `navigator.serviceWorker.ready` before opening any vault iframe.
2. **Iframe URL.** Open the vault file as `<iframe src="/__sg-vfs/<vault-id>/<path>">`. The SW intercepts the navigation request and returns the file's HTML bytes.
3. **Sub-resource requests.** For every `<link>`, `<script>`, `<img>`, etc. in that HTML, the browser fires a fetch to `/__sg-vfs/<vault-id>/<resolved-path>`. The SW intercepts and returns the vault bytes.
4. **Vault bytes in the SW.** The SW doesn't hold the decrypted vault — it asks the controlling client (the vault page) via `clients.matchAll()` + `postMessage`, and the page responds with the bytes. (Alternatively, the page can stuff bytes into `Cache` storage that the SW reads directly — faster but coupling them via `postMessage` is simpler to get right first.)

### Lifecycle considerations

- **HTTPS or `localhost` only.** Already required for Web Crypto, so no new constraint.
- **Async registration delay.** First page-load waits for SW activation (~50-200 ms). After that, instant.
- **Update cycle.** A new SW version activates only after all controlled clients close. We'd version the SW file and use `self.skipWaiting()` + `clients.claim()` for fast rollouts; users on stale tabs continue to use the old SW until refresh.
- **DevTools.** Requests appear as `(from ServiceWorker)` in the Network panel. Source-map debugging still works.

---

## What gets simpler

| Today's code | After SW |
|---|---|
| `_inlineVaultAssets` (regex-based `<link>`/`<script>` rewriter) | **gone** |
| `_bytesToBase64` + base64-inflated blob HTML | **gone** |
| `window.fetch` patch in bridge script | **gone** (SW handles) |
| `HTMLImageElement.prototype.src` setter patch | **gone** (SW handles) |
| `MutationObserver` for IMG nodes | **gone** (SW handles) |
| Anchor-click interception → parent re-render | **simpler** — let the browser navigate the iframe; SW serves the next page |
| `sg.loadCss` / `sg.loadJs` runtime loaders | **optional** — declarative `<link>`/`<script>` works again |
| Bridge script injection into every HTML head | **smaller** — only the `sg.vfs.{write,list}` postMessage protocol stays (writes still need the parent because the SW doesn't own the decrypted vault) |

The remaining bridge surface shrinks to roughly:

```js
// Tiny bridge: just the write/list protocol the SW can't serve
window.sg = {
    vfs: { write, read, readText, list },   // postMessage to parent
    app: { selfPath, writable },
};
```

Reads (`sg.vfs.read`) become a no-op on top of `fetch`, since `fetch` now hits the SW directly:

```js
sg.vfs.read = path => fetch(path).then(r => r.arrayBuffer());
sg.vfs.readText = path => fetch(path).then(r => r.text());
```

---

## What stays the same

- **Sandbox semantics.** The iframe still runs sandboxed (`allow-scripts`). The SW serves bytes, but the iframe can't reach the vault page directly except via `postMessage`.
- **Encryption boundary.** The SW does not decrypt anything. Vault bytes pass to the SW already-decrypted from the parent page (which is the only place the vault key exists). The SW is just a glorified request multiplexer.
- **Server-side.** Nothing changes on the backend. The SW lives entirely client-side.
- **`sg.vfs.write` / `sg.vfs.list`.** These still need the parent — the SW can't dispatch to the vault data store, only the page can.

---

## Trade-offs

### Wins

- **Declarative tags work.** Authors can drop in static-site exports, third-party HTML, or anything else that uses `<link>` / `<script src>` without modification.
- **No regex-based markup mangling.** That whole class of bugs is gone.
- **No bridge script injection into every page.** The HTML the iframe sees is bytes-for-bytes what's in the vault. Useful for content integrity checks.
- **Module loading and workers work.** Unlocks more sophisticated demos (e.g. `import` chains, web-worker-based compute).
- **Smaller blobs.** No base64 inflation, no injected bridge text.

### Costs

- **Service Worker complexity.** Lifecycle, scope, update propagation, debugging — all real concerns. Engineering needs to know SWs.
- **First-load delay.** Waiting for SW activation on a cold session.
- **Scope coupling.** SW belongs to the origin that registered it. If we ever want vault content rendered on a different origin (e.g. embedded in `send.sgraph.ai` directly, not in a `vault.sgraph.ai` iframe), the SW won't be there. We'd need either to register on every relevant origin or to keep the bridge approach as a fallback.
- **Cache subtleties.** SW response caching can shadow updates. Need to use `Cache-Control: no-store` or skip cache entirely for vault responses.
- **Versioning.** Two ways an upgrade can fail: client has old SW, or client has new SW with old vault page expectations. Need a clear contract version in the request URL or headers.

### Migration risks

- **Existing vault content** authored against today's contract still works (`sg.loadCss` / `sg.loadJs` calls just become unnecessary, not broken).
- **Iframe URL change.** Today's blob URLs become real URLs. Anything that screenshot-tests or hardcodes blob URLs breaks. Probably nothing in the test suite does this.
- **Same-vault navigation.** Today's anchor-click interceptor can be removed; browser-native navigation under the SW scope works. Verify back-button and history behavior.

---

## Migration plan (sketch)

Three phases, each independently shippable:

### Phase 1 — Stand up the SW alongside the bridge

1. Add `sgraph_ai_app_send__ui__vault/.../sw-vfs.js` (the SW source).
2. Register it at vault page load behind a feature flag. Don't change iframe rendering yet.
3. Verify SW activates and can intercept fetches under `/__sg-vfs/`.

### Phase 2 — Switch one render path to use the SW

1. When the flag is on, render iframes with `src="/__sg-vfs/<id>/<path>"` instead of blob URLs.
2. SW handles all subresource fetches by `postMessage`-ing the controlling page for vault bytes.
3. Existing `sg.loadCss` / `sg.loadJs` calls keep working (they go through `fetch`, which now hits the SW).
4. Test against the existing demo set (hub, cities, survey, etc.). Confirm parity.

### Phase 3 — Delete the bridge inlining + fetch/img patches

1. Bridge shrinks to just the `sg.vfs.{write,list}` postMessage protocol.
2. Update [authoring guide](./AUTHORING.md) to soften the "must use sg.loadCss/loadJs" rule into "either declarative `<link>`/`<script>` or sg.loadCss/loadJs both work."
3. Remove the feature flag once the SW path is the default for all environments.

Each phase can land independently and be reverted independently.

---

## Open questions

- **Cross-origin embedding.** If we ever want to render vault content from `send.sgraph.ai` into a vault iframe, the SW can't help (SW is per-origin). Would we re-register the SW on `send.sgraph.ai`? Or accept that cross-origin embedding stays on the bridge approach?
- **SW vs. shared cache.** Storing vault bytes in `Cache` storage that the SW reads directly is faster than `postMessage` round-trips, but couples the page and SW more tightly. Worth measuring once we have demos pushing real load.
- **Streaming responses.** The SW can return `ReadableStream`-backed responses. For large vault files this would beat the postMessage approach. Stretch goal.
- **Range requests.** Some media tags (`<video>`, `<audio>`) issue Range requests. The SW would need to honor them or the playback breaks.

---

## See also

- [Authoring guide](./AUTHORING.md) — the contract today's vault HTML follows
- [BRW-020 inline vault assets discussion](../../../team/comms/changelog/) — historical context for the data-URI approach we replaced
