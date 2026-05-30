# Phase 3 — Standalone `/app` → null-origin + bridge split (THE SECURITY GATE)

**Pack version** v0.28.7 · **Audience** the agent making the permission model an *enforced* boundary.
**Authoritative spec:** version-2 §01 §13 + §5.4 parity list + `SECURITY-same-origin-app-bypass.md`.
**Preconditions:** Phase 2 landed and the kernel is factored out.

**What this phase ships:** the standalone `/app` app frame becomes `null`-origin and the bridge splits
into a **secret-less stub** (in the app frame) plus a **secret-holding kernel** (the parent frame).
This closes the same-origin app-bypass finding for the main app — the permission model becomes a *real*
boundary, even against untrusted app code. It is **the gate for any third-party-app roadmap**.

> The mechanism is already proven in the codebase: `sg-embed-frame.js:16,147` mounts untrusted embeds
> with `allow-scripts allow-popups allow-presentation` — *no* `allow-same-origin`, *no* bridge. Phase 3
> generalises that pattern to the main app frame.

---

## 0. Definition of done

- The 4 sandbox sites in `app-shell.js` (version-2 §5.1: lines 923, 1037, 1094, 1174) drop
  `allow-same-origin`. Sandbox becomes `allow-scripts` (+ `allow-forms` only where confirmed needed —
  see version-2 §5.7.2).
- `sg.*` in the app frame is a **secret-less stub** — every call is a `SecureChannel.request` to the
  kernel; **no access to `localStorage`, `window.parent`, `event.source`, or any vault internals**.
- All shipped first-party apps still work — version-2 §5.4 **parity list** is green item by item.
- A `null`-frame adversarial probe confirms (T1, T2, T3 from version-2 §5.3): `parent.document` access
  throws, `localStorage` throws `SecurityError`, no usable `window.parent` initiation channel.

## 1. The split — what moves where

Today `app-shell.js` is the *kernel* and the bridge handlers in *one same-origin context*. Phase 3
separates them across a `null`-origin frame boundary:

| Concern | Today (same frame) | After Phase 3 |
|---|---|---|
| `localStorage`/`sessionStorage` read of `sg-vault-key`/access token (`:82, :86, :225, :366, :517, :550, :552, :609`) | inline | **kernel-side only** (the top-kernel `bootFromOrigin` from Phase 2) |
| `SGVault.open` / `VaultDataSource` / `SGSend` (the data + server client) | inline | **kernel-side only** |
| `AppPermissions.{isFloor, can}` (the policy engine) | inline gate inside bridge handlers | **kernel-side only**, applied before any data-source call |
| The bridge handlers `vfs.{read,write,list}` / `vault.*` / `app.*` / `ui.*` / `auth.*` / `history.*` | inline | **kernel-side handlers** registered on a `SecureChannel` to the app |
| `window.sg.*` (the app-visible API) | direct method calls | **stub** — every method is a `SecureChannel.request` to the kernel |

The kernel was already factored out in Phase 2 (`kernel-boot.js`). Phase 3 finishes the job by **moving
the bridge handler bodies into the kernel** and making the app frame call them over the channel.

## 2. File changes

```
sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/
  app-shell.js              — the top-kernel host; runs Kernel, mounts the null-origin app iframe
  sg-app-stub.js            — NEW. The secret-less window.sg stub for the app frame. Self-contained
                                (no imports), injected into the app iframe alongside the app HTML.
  kernel-handlers.js        — NEW. The handler bodies (vfs.read, vfs.write, list, vault.mount, ...)
                                registered on the kernel's app-side SecureChannel. Pure functions of
                                Kernel state + payload.

en-gb/app/index.html        — load order unchanged (app-permissions, secure-channel, app-shell)
```

## 3. The new `_mountApp` (kernel-side) — `null`-origin + port

Replace the four iframe mount sites (version-2 §5.1) so they (a) drop `allow-same-origin` and (b) hand
the app a `MessagePort` as its only inbound:

```js
// Inside Kernel._mountApp(), replacing the existing _mountApp / _mountVaultFile / _mountPageLayout /
// _mountAppViaEntry mount blocks at app-shell.js:923,1037,1094,1174

const iframe   = document.createElement('iframe');
iframe.sandbox = 'allow-scripts';                        // ← was 'allow-scripts allow-forms allow-same-origin'
iframe.style.cssText = '...';                            // unchanged
iframe.srcdoc  = await this._buildAppSrcdoc(appHtml);    // app HTML + inlined sg-app-stub.js
document.body.appendChild(iframe);

// One-shot bootstrap message to hand it a port (the ONLY window.postMessage)
const channel = await SecureChannel.create(iframe, { sensitiveKey: false /* local edge */ });
this._appChannel = channel;

// Register every handler the app's sg.* can call (kernel-side bodies — version-2 §4.4)
channel.handle('vfs.read',   ({ path })            => this.handleVfs('read', { path }));
channel.handle('vfs.write',  ({ path, data, credential }) => this.handleVfs('write', { path, data, credential }));
channel.handle('vfs.list',   ({ path })            => this.handleVfs('list', { path }));
channel.handle('vfs.delete', ({ path })            => this.handleVfs('delete', { path }));
channel.handle('vault.mount',    (p)               => this.mountChild(p));
channel.handle('vault.unmount',  ({ mountId })     => this.unmountChild(mountId));
channel.handle('vault.mounts',   ()                => this._mounts.list().map(toPublicView));
channel.handle('app.selfPath',   ()                => this._selfPath);
channel.handle('app.writable',   ()                => !!this._dataSource?.writable);
channel.handle('broker.log',     ({ mountId })     => this._broker.log({ mountId }));
// ... add the rest from the existing bridge surface (version-2 §5.1 list)
```

`_buildAppSrcdoc` wraps the app HTML with the stub:
```js
async _buildAppSrcdoc(appHtml) {
  const stub = await fetch('/_common/js/components/app-shell/sg-app-stub.js').then(r => r.text());
  // app HTML is already trusted-as-data — inject the stub BEFORE the app's <head> scripts so window.sg
  // exists before app code runs.
  return appHtml.replace(/<head[^>]*>/i, m => `${m}\n<script>${stub}</script>`);
}
```

## 4. `sg-app-stub.js` — the secret-less app-side API

The whole `window.sg.*` surface, every method a thin promise over a `SecureChannel.request`. **No
secrets touched. No `localStorage`. No `window.parent` reach.**

```js
(function () {
  'use strict';
  let channel = null;

  // Bootstrap: the ONE window.message listener; grabs the port and never listens on window again.
  window.addEventListener('message', function boot(e) {
    if (e.data?.type !== 'init') return;
    window.removeEventListener('message', boot);
    const port = e.ports[0];
    SecureChannel.accept(port, { expectSensitive: false }).then(ch => {
      channel = ch;
      window.sg.__ready = true;
    });
  }, { once: true });

  const req = (type, payload) => {
    if (!channel) throw new Error('sg.* used before init');
    return channel.request(type, payload);
  };

  window.sg = {
    vfs: {
      read:     (path)         => req('vfs.read',  { path }),
      readText: (path)         => req('vfs.read',  { path }).then(b => new TextDecoder().decode(b)),
      write:    (path, data, opts) => req('vfs.write', { path, data, credential: opts?.credential }),
      list:     (path)         => req('vfs.list',  { path }),
      delete:   (path)         => req('vfs.delete',{ path }),
    },
    vault: {
      mount:   (opts)          => req('vault.mount',   opts),
      unmount: (mountId)       => req('vault.unmount', { mountId }),
      mounts:  ()              => req('vault.mounts',  {}),
    },
    history: { /* log, list, read, readBlob — same pattern */ },
    ui:      { /* message, requestPermission */ },
    broker:  { log: (opts={})  => req('broker.log',  opts) },
    app:     { /* selfPath, writable populated lazily via req() or pushed via 'app:ready' event */ },

    // SecureChannel will already have inlined secure-channel-envelope + secure-channel sources into
    // the stub bundle (see §5) — DO NOT load them via <script src>; null origin breaks that.
  };
})();
```

> **Build step:** `sg-app-stub.js` is bundled with the SecureChannel sources inlined (the stub uses
> `SecureChannel.accept`). Mirror the same self-contained-bundle approach as `kernel-shell.html` in
> Phase 2 §6. Lightweight: just textual concatenation.

## 5. Parity list — each shipped same-origin behaviour, with its resolution

These are the items from version-2 §5.4 that *will* break under `null` if not re-expressed. Treat this
as a checklist; tick each before claiming the phase done.

| # | Today | Under `null` origin |
|---|---|---|
| **P1** | `sg.loadCss(path)` injects a `<link>` whose `href` is a vault path | Route via the bridge: stub fetches bytes via `sg.vfs.read(path)`, base64-encodes into a `data:text/css;base64,…` URL, injects `<link>` with that. (Same for `sg.loadJs` → blob-URL non-module `<script>`.) |
| **P2** | In-app `<a href="other.html">` navigation | Top kernel owns the URL; stub catches click navigation, asks kernel to remount with the new entry path, re-injects bundle. |
| **P3** | Markdown render pipeline (`MarkdownParser.parse`, the fix earlier in this branch) | Already inlined into the rendered iframe; unaffected. Confirm the markdown branch in `_mountVaultFile` still works under `null` (it's a pure JS render — no same-origin assumption). |
| **P4** | `img.src = 'photo.png'` auto-intercept (turns vault paths into `blob:` URLs) — `app-shell.js:1160, 1337` | The intercept used to be a `MutationObserver` patching `img.src` from the parent. Under `null`, do it **in the stub**: patch `HTMLImageElement.prototype.src` in the stub's bootstrap to call `sg.vfs.read` and assign `blob:` — pattern from the existing `app-shell.js:1160` move it stub-side. |
| **P5** | `blob:` mounting for inner-vault files (`app-shell.js:1397`) | Continue to use `blob:` URLs; they work cross-origin. Confirm the read-through path returns bytes the stub can re-wrap. |
| **P6** | `window.sgVault` facade (`app-shell.js:1332`) | Re-export as a thin alias on `window.sg.legacy` in the stub (matches existing callers). Update the migration guide. |
| **P7** | `sg-app-banner` iframe `onerror` capture (UI reality doc notes "same-origin only") | **Will break**. Either: (a) move the banner *inside* the app iframe (stub renders it), or (b) drop the auto-capture and have the stub forward errors via `sg.ui.message(…, 'error')`. Decide before Phase 3 lands — flag in §6 below. |

## 6. Migration / repair notes

Per the project lead, breakage is acceptable as long as the repair is documented.

- **Update `library/guides/vault-html/AUTHORING.md`**: add a "null-origin contract" section. Things
  that no longer work for first-party apps:
  - `localStorage` / `sessionStorage` access from the app frame (throws `SecurityError`).
  - `window.parent` / `window.top` / `frames[]` reach (no usable references in the trust model).
  - `fetch()` of vault-relative paths — already not supported (per AUTHORING.md TL;DR), but now
    *literally* impossible (`null` origin → CORS-blocked).
  - Cookies (`document.cookie`) — null origin has no cookie jar; if any app reads/writes cookies,
    move that state into `sg.vfs.write('app-state/…')`.
- **Update `MIGRATING-TO-THE-PERMISSION-MODEL.md`** with a **"Phase-3 repair checklist"** for vaults
  whose apps break:
  1. App shows blank / DevTools shows `SecurityError: localStorage` → replace `localStorage` access with
     `sg.vfs.read/write('app-state/<key>.json')`.
  2. App shows blank / `window.parent` undefined access → all parent reach goes via the documented
     `sg.ui.*` API; rewrite the offending code.
  3. App uses a `<script src="lib.js">` of a vault path → switch to `sg.loadJs('lib.js')`.
  4. App uses a declarative `<link rel="stylesheet" href="theme.css">` of a vault path → switch to
     `sg.loadCss('theme.css')`.

## 7. Adversarial-test confirmations (version-2 §5.3 T1–T3)

Add a small in-browser probe page at `library/guides/vault-html/null-origin-probe.html` (loaded once
to confirm the architecture holds) that runs from within a vault app:

```js
const probe = {};
try { probe.parentDoc = window.parent.document?.title; } catch (e) { probe.parentDoc = 'BLOCKED: ' + e.name; }
try { probe.ls       = localStorage.getItem('sg-vault-key'); } catch (e) { probe.ls = 'BLOCKED: ' + e.name; }
try { probe.fetch    = await fetch('/_common/js/components/app-shell/app-shell.js').then(r => r.status); } catch (e) { probe.fetch = 'BLOCKED: ' + e.name; }
sg.ui.message('probe: ' + JSON.stringify(probe), 'info', { ttl: null });
// Expect: parentDoc 'BLOCKED: SecurityError', ls 'BLOCKED: SecurityError', fetch 'BLOCKED'
```

This is **T1 + T2 + the ambient-fetch shutdown**. If any of those returns data, the phase is **not
done** — go back and find which sandbox flag leaked.

## 8. Sequencing within the phase

Recommended sub-steps (commit each):
1. **A:** Move the bridge handler bodies into `kernel-handlers.js`, called by the existing same-origin
   bridge. Confirm nothing breaks (still same-origin; pure refactor).
2. **B:** Add the `SecureChannel.create` + `handle(...)` wiring on the kernel side, in *parallel* with
   the existing bridge (the stub doesn't exist yet — this is internal plumbing).
3. **C:** Add `sg-app-stub.js` + the `_buildAppSrcdoc` injection; **but keep `allow-same-origin` for now**.
   The stub uses the channel; the legacy bridge is dead code but still loaded. Confirm parity (P3–P5).
4. **D:** Walk the parity list (P1, P2, P4, P6, P7) one by one — each is a small PR. Re-test the app.
5. **E:** **Drop `allow-same-origin`** from all 4 sandbox sites (version-2 §5.1). This is the security
   gate flipping. Run the probe (§7) — if all three are blocked, you're done.
6. **F:** Remove the dead legacy bridge code in `app-shell.js`; commit the cleanup.

Steps A–D are non-breaking. Step E is the breaking change; sequence it deliberately and announce it in
the changelog (vault apps in the wild may need the repair checklist).

## 9. Hand-off to Phase 4

Phase 4 (unify the three iframe contexts) becomes trivial once Phase 3 lands — the standalone `/app`,
the `/vault` HTML view, and the editor preview now all share the same `Kernel` + `sg-app-stub` pair;
the only per-context difference is the *data source* (live vault vs read-only vault vs dirty editor
buffer). See `04-PHASES-4-6-and-tests-and-repair.md`.
