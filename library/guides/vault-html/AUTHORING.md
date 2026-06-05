# Authoring HTML pages that run inside a vault

This guide is for anyone — human or AI — writing HTML files that will be stored inside a vault and rendered by the SGraph Send vault iframe. It documents the **calling-convention contract** that vault HTML must follow, the **runtime API** the iframe exposes (`window.sg.*`), and the **patterns and anti-patterns** for loading CSS, JS, and data.

> **Permission model (new).** Mutations (`sg.vfs.write`, `sg.fs.*`, `sg.vault.*`) are now
> **deny-by-default** and must be declared in `app.json` `permissions`; `.vault/**` is off-limits.
> Migrating an existing app? Read **[MIGRATING-TO-THE-PERMISSION-MODEL.md](MIGRATING-TO-THE-PERMISSION-MODEL.md)** first.

> **Verified against the live bridge (`app-shell.js`) on 2026-05-26.** Corrections from the previous
> revision: vault-relative `fetch()` is **not** auto-routed (use `sg.vfs.read`/`readText`); only an
> `img.src = …` assignment **from JS** is intercepted (a declarative `<img src>` in the initial HTML
> is **not**); the ready-log-line text was updated. New: `sg.sync` / `sg.auth` / `sg.ui` / `sg.history`
> are documented, plus reading **sub-vaults**.

> **TL;DR.** Inside a vault iframe, you cannot write `<link rel="stylesheet" href="theme.css">` or `<script src="helper.js"></script>` against vault-relative paths. Instead, call `sg.loadCss('theme.css')` or `sg.loadJs('helper.js')` at runtime. To read data, use **`sg.vfs.readText('cities.json')`** — a plain `fetch()` of a vault path does **not** work. `<a href="other.html">` navigation and `img.src = 'photo.png'` set **from JS** work automatically.

---

## Why this contract exists

The vault iframe is loaded from a `blob:` URL. Vault files don't live on a web server — they live in the user's browser, decrypted on-device, and served to the iframe via `postMessage` between iframe and parent.

When the browser parses your HTML, it processes declarative resource references **before any JavaScript runs**:

- `<link rel="stylesheet" href="theme.css">` — the HTML parser fetches `theme.css` immediately, against the blob URL's opaque origin. Result: 404.
- `<script src="helper.js">` — same.
- `<iframe src="page.html">`, `<source src="clip.mp4">`, `@import url(...)` inside CSS — same family.

Our bridge script (which routes vault file lookups through the parent) runs **inside** your iframe — it cannot intercept fetches the browser fires before scripts run. There is no way to fix this from inside the iframe without server-level help.

The fix is the contract below: **load CSS and JS at runtime via the `sg.loadCss` / `sg.loadJs` loaders**, which read the vault bytes over the postMessage bridge (not `fetch`) and inject them.

A future architectural upgrade ([Service Worker](./service-worker-future.md)) will lift this restriction. Until then, follow the contract.

---

## What works automatically

Anything that goes through a JavaScript API works without modification:

| Pattern | Status | Why |
|---|---|---|
| `window.sg.vfs.read(path)` / `readText` / `list` / `write` | ✅ Works | Custom postMessage protocol — **the supported way to read/write vault data** |
| `sg.loadCss(path)` / `sg.loadJs(path)` | ✅ Works | loaders that read vault bytes over the bridge and inject `<style>`/`<script>` |
| `img.src = 'photo.png'` (assigned **from JS**) | ✅ Works | `HTMLImageElement.prototype.src` setter is patched to decrypt + serve a `blob:` |
| `<a href="other.html">` (clicked) | ✅ Works | Click handler postMessages parent, which re-renders the iframe |
| `<a href="other.html#section">` (clicked) | ✅ Works | Fixed 2026-05-30 — the `?query`/`#fragment` is stripped before the extension check; the fragment is forwarded and scrolled-to in the new doc |
| `<a href="https://example.com">` (clicked) | ✅ Opens in a new tab | Fixed 2026-05-30 — the iframe sandbox got `allow-popups allow-popups-to-escape-sandbox`; the click interceptor calls `window.open(href, '_blank', 'noopener,noreferrer')` synchronously from the gesture |
| `sg.fs.*`, `sg.vault.*`, `sg.history.*`, `sg.sync.*`, `sg.auth.*`, `sg.ui.*`, `sg.state.*` | ✅ Works | postMessage command protocol (see below) |

If you stick to these patterns, your page just works.

> **Heads-up (changed):** plain `fetch('cities.json')` is **not** patched — it resolves against the
> iframe's opaque blob origin and 404s. Use `sg.vfs.readText('cities.json')` instead. Likewise, a
> **declarative** `<img src="photo.png">` in the initial HTML is **not** re-routed (only an
> `el.src = …` assignment from JS is). See "What does NOT work" and §6.

---

## What does NOT work

| Pattern | Status | Why |
|---|---|---|
| `<link rel="stylesheet" href="theme.css">` | ❌ 404 | Parser fetches before bridge installs |
| `<script src="helper.js"></script>` | ❌ 404 | Same |
| `<iframe src="other.html">` | ❌ 404 | Same |
| `<source src="clip.mp4">` | ❌ 404 | Same |
| `@import url("base.css")` inside CSS | ❌ 404 | CSS parser, same problem |
| `import('./mod.js')` (dynamic ESM) | ❌ 404 | Module loader, same problem |
| `new Worker('w.js')` | ❌ 404 | Worker loader, same problem |
| `fetch('cities.json')` (vault-relative) | ❌ 404 | **`window.fetch` is NOT patched** — use `sg.vfs.readText('cities.json')` |
| `XMLHttpRequest` | ❌ Not patched | Use `sg.vfs.*` |
| `<img src="photo.png">` (declarative, in initial HTML) | ❌ 404 | Only `el.src = …` from JS is intercepted; for markup images, set `src` from JS (§6) |

These all fail with a 404 in the iframe console, because the URL gets resolved against the iframe's opaque blob origin, which has nothing under it.

---

## The runtime API: `window.sg`

Every vault HTML file gets a `<script>` injected into its `<head>` that exposes:

```js
window.sg = {
    vfs: {
        write   : (path, content)        => Promise<{path, size}>,   // string | Uint8Array | ArrayBuffer
        read    : (path)                  => Promise<ArrayBuffer>,
        readText: (path)                  => Promise<string>,
        list    : (prefix)                => Promise<[{path,name,size,type}]>,
    },
    loadCss : (path) => Promise<HTMLStyleElement>,    // load + inject CSS
    loadJs  : (path) => Promise<HTMLScriptElement>,   // load + execute JS
    app: {
        selfPath : 'demos/hub.html',    // path of the currently-open file
        writable : true,                // false for read-only (share-token / sub-vault) views
        vaultName: 'My Vault',
        vaultId  : 'abcd1234',
        fileCount: 12,
    },
    // History — read past commits / trees / blobs (read-only). See "Reading history".
    history: {
        log     : (opts)            => Promise<[{id,parents,tree_id,timestamp_ms,message}]>, // opts: {limit, from}
        list    : (commitId, path)  => Promise<[{path,name,dir,size}]>,   // one level under `path` at that commit
        read    : (commitId, path)  => Promise<ArrayBuffer>,              // file bytes at that commit
        readText: (commitId, path)  => Promise<string>,
        readBlob: (blobId)          => Promise<ArrayBuffer>,              // a content-addressed object by id
    },
    // Sync (named-branch status / publish / pull). Writes need a writable vault.
    sync: {
        status : () => Promise<{current, serverHasNewer, localHasUnsynced, writable}>,
        push   : () => Promise<...>,
        pull   : () => Promise<...>,
        refresh: () => Promise<...>,
    },
    // Server access token (write gate) — separate from the encryption key.
    auth: {
        hasKey: true,
        setKey: (key) => Promise<{ok, valid, remaining}>,
        check : (key) => Promise<{valid}>,
        clear : ()    => Promise<{cleared}>,
    },
    // Toast notifications surfaced in the host chrome (app-hud).
    ui: {
        message          : (text, type, opts) => handle,            // type: 'info' | 'success' | 'error' | 'warn'; opts: {ttl}
        dismiss          : (handle) => void,
        // Ask the user (via a HUD overlay) to grant a declared-but-consent-gated verb.
        // Returns { granted: bool }. The grant is cached per (vault, appId, verb) in the
        // top-level kernel's localStorage so repeated calls don't re-prompt. vault.delete
        // ALWAYS re-confirms regardless of cache.
        requestPermission: (verb, path) => Promise<{granted: boolean}>,
    },
    // Mutations against the host vault — gated by app.json `permissions.fs.*` grants
    // AND a user-consent overlay on first call per (vault, appId, verb). Reads use the
    // standard vfs.* namespace; these are for non-read changes. Throws on read-only views.
    fs: {
        move  : (from, to) => Promise<{ok: true, from, to}>,
        delete: (path)     => Promise<{ok: true, path}>,
        mkdir : (path)     => Promise<{ok: true, path}>,
    },
    // Vault lifecycle — create / unlink / delete sub-vaults, and ViV mount/unmount for
    // cross-vault reads/writes through this kernel. Each verb is independently grantable
    // and consent-gated (vault.delete always re-confirms regardless of cache).
    vault: {
        create  : (path, label)  => Promise<{vaultKey, path}>,
        unlink  : (path)         => Promise<{ok: true}>,
        delete  : (path)         => Promise<{ok: true}>,
        mount   : ({prefix, ref, label}) => Promise<{mountId}>,
        unmount : (mountId)      => Promise<{ok: true}>,
        mounts  : ()             => Promise<[{mountId, prefix, label, ref}]>,
    },
    // Device-local preferences for THIS app on THIS browser (NEW 2026-05-30).
    // Backed by the top-level kernel's localStorage, namespaced as
    // sg-app-state:<vaultId>:<appEntryPath>:<key>. Values are JSON-encoded, capped
    // at 64 KiB per key. Does NOT travel with the vault; use sg.fs.write('.app-state/...')
    // for vault-persistent state that should sync across devices.
    state: {
        get   : (key)        => Promise<value | null>,
        set   : (key, value) => Promise<{ok: true}>,
        remove: (key)        => Promise<{ok: true}>,
        clear : ()           => Promise<{ok: true, removed}>,    // only this app's keys
        keys  : ()           => Promise<string[]>,               // un-namespaced (just the key part)
    },
};
```

> `sg.git.*` is a **deprecated** alias for `sg.sync.*` (status/check/push/pull) — don't use it in new code.

Plus a backwards-compat alias for older demos:

```js
window.sgVault = {
    writeFile : window.sg.vfs.write,
    readFile  : window.sg.vfs.readText,
    listFiles : () => window.sg.vfs.list(''),
    writable  : window.sg.app.writable,
    selfPath  : window.sg.app.selfPath,
};
```

You can confirm the bridge is active by checking the iframe console for:

```
[sg-vfs] ready | writable=true | vaultName=<name> | page: /en-gb/app
```

If you see this log line, the API is ready. The bridge installs synchronously during `<head>` parsing, so `window.sg` is available to any inline `<script>` you write.

---

## Patterns

### 1. Tiny demo: inline everything

If the demo is small, don't bother with separate files. Inline the CSS and JS:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Hello vault</title>
  <style>
    body { font-family: system-ui; padding: 2rem; background: #0a0a18; color: #e2e8f0; }
    h1   { color: #4ECDC4; }
  </style>
</head>
<body>
  <h1>Hello vault</h1>
  <p id="ts"></p>
  <script>
    document.getElementById('ts').textContent = new Date().toISOString();
  </script>
</body>
</html>
```

This works anywhere. Most hand-written demos belong here.

### 2. Larger demo: load CSS/JS via the loaders

If you have a long stylesheet or a real script, split them into separate vault files and load them at runtime:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cities bar chart</title>
  <style>
    /* tiny critical CSS — hide the page until the real stylesheet arrives */
    body { display: none; }
  </style>
  <script>
    Promise.all([
      sg.loadCss('theme.css'),
      sg.loadJs('chart-lib.js'),
    ]).then(() => sg.loadJs('app.js'))
      .then(() => { document.body.style.display = 'block'; })
      .catch(err => console.error('[demo] load failed:', err));
  </script>
</head>
<body>
  <h1>Cities by population</h1>
  <div id="chart"></div>
</body>
</html>
```

Notes:
- The `body { display: none }` rule is critical. Without it, the page renders unstyled before `theme.css` arrives, then jumps when the styles apply (FOUC). Hide first, reveal after load.
- **Reveal with `display = 'block'`, not `''`.** Setting `style.display = ''` only clears the *inline* style, so it falls back to your `body { display: none }` stylesheet rule and the page stays hidden. Set the explicit value (`'block'`, or whatever your layout needs — `'flex'`, `'grid'`, …).
- Use `Promise.all` to load independent assets in parallel.
- Use chained `.then` for assets that depend on each other (e.g. `app.js` depends on `chart-lib.js` already being on the page).
- The loaders inject `<style>` / `<script>` elements into `document.head` with a `data-sg-loaded="<path>"` attribute, so you can inspect them in DevTools.

### 3. Reading data files at runtime

Use `sg.vfs.readText` (or `sg.vfs.read` for binary). **Do not use `fetch()` for vault paths — it is
not routed through the bridge and will 404.**

```js
sg.vfs.readText('cities.json').then(JSON.parse).then(render);
// binary:
sg.vfs.read('logo.png').then(buf => { /* ArrayBuffer */ });
// list a folder:
sg.vfs.list('maps').then(entries => { /* [{path,name,size,type}] */ });
```

`fetch()` may still be used for **absolute** external URLs (`https://…`) — those leave the vault and
behave like any web request.

### 4. Writing data files (writable vaults only)

```js
const data = { excitement: 'high', when: new Date().toISOString() };
await sg.vfs.write('responses/2026-05-09.json', JSON.stringify(data, null, 2));
```

`sg.vfs.write` accepts `string | Uint8Array | ArrayBuffer`. Strings are UTF-8 encoded.

> **Permission required (new).** Writes are now **deny-by-default**: `sg.vfs.write` (and
> `sg.fs.move/delete/mkdir`, `sg.vault.*`) reject with `EPERM` unless the app's `app.json` declares the
> grant — e.g. `{ "permissions": { "fs": { "write": ["responses/"] } } }`. The vault must also be
> writable (an access token). See **[MIGRATING-TO-THE-PERMISSION-MODEL.md](MIGRATING-TO-THE-PERMISSION-MODEL.md)**.

Always check `sg.app.writable` before showing UI that suggests editing — in a share-token (read-only) view, writes will reject with `Read-only vault`.

```js
if (!sg.app.writable) {
    document.querySelector('#save-btn').style.display = 'none';
}
```

### 5. Same-vault navigation

Just use anchor tags. Click handling is intercepted automatically:

```html
<a href="other-page.html">Go to the other page</a>
<a href="/absolute/from/root.html">Vault-rooted absolute path</a>
<a href="other-page.html#section">Page anchor — fragment scrolls into view</a>
<a href="https://example.com">External link — opens in a new tab</a>
```

**What the host does for you (so your app shouldn't reinvent these):**

- **Hash anchors** — `<a href="page.html#section">` was historically broken (the `.html`
  endsWith check failed because the href ended in `#section`, the click fell through,
  the static host 403'd). Fixed 2026-05-30. The fragment is forwarded to the new srcdoc
  and applied on `DOMContentLoaded` via a postMessage from the parent. Apps don't need
  any workaround.
- **External links** (`http://`, `https://`, protocol-relative `//`) open in a new tab
  via `window.open(..., '_blank', 'noopener,noreferrer')`. The iframe sandbox has
  `allow-popups allow-popups-to-escape-sandbox`, so the new window is unrestricted.
  Don't add `target="_blank"` markup — the host handles it.
- **`mailto:` and `javascript:`** are passed through unchanged.
- **Pure-fragment links** (`<a href="#section">`) are passed through — the browser
  scrolls within the current page without the host being involved.
- **Friendly 404** — clicks pointing to files that don't exist (or are inside the
  `.vault/**` floor) land on a host-rendered "Page not found in this vault" overlay
  with a back arrow. You don't need to handle broken-link routing yourself.
- **Back / forward / Home / Reload / Recent pages** — the SG/App HUD has a browser-style
  nav row above your iframe with all five. The path is editable like a real URL bar
  (click → type a vault-absolute path → Enter to navigate). Apps that used to build
  their own back button can drop it. The nav row can be hidden via `app.json` if it
  conflicts with the app's design — see "Configuring the host chrome" below.

### 6. Images

Vault-relative images work **only when `src` is assigned from JS** — the bridge patches
`HTMLImageElement.prototype.src` to decrypt the file and serve a `blob:`. A **declarative**
`<img src="vault-relative">` in the initial HTML is **not** intercepted (the parser fetches it
against the blob origin before any JS runs → 404).

```html
<!-- ❌ declarative vault-relative src → 404 -->
<img src="cover.jpg" alt="Cover">

<!-- ✅ set it from JS -->
<img id="cover" alt="Cover">
<script>
  document.getElementById('cover').src = 'cover.jpg';   // intercepted → blob:
  const el = document.createElement('img');
  el.src = 'avatar.png';                                // also works
  document.body.appendChild(el);
</script>
```

For full control (or other media), read the bytes and make your own object URL:

```js
sg.vfs.read('cover.jpg').then(buf => {
  img.src = URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' }));
});
```

Note: relative `src` is resolved against the current page's directory; an absolute vault path
(`/photos/x.png`) is taken from the vault root. `<picture>`/`<source srcset>` is **not** intercepted.

---

## Configuring the host chrome — `app.json` `hud.*`

The SG/App host renders chrome around every app: a top row (brand, vault badge, app
title, copy-link, debug, etc.) and — as of 2026-05-30 — a browser-style nav row below
it (back / forward / reload / home / editable path / copy-path / ⋯ recent). Apps can
declare how much of this chrome they want via `app.json`:

```json
{
  "entry": "index.html",
  "present": true,
  "title": "My App",
  "hud": {
    "mode": "full",
    "show": {
      "vaultName":  true,
      "appTitle":   true,
      "openVault":  true,
      "copyLink":   true,
      "print":      true,
      "debug":      true,
      "navBar":     true,
      "navArrows":  true,
      "navPath":    true,
      "navRefresh": true,
      "navHome":    true
    }
  }
}
```

`hud.mode` is the headline switch:

- **`"full"`** *(default)* — chrome row + nav row both visible. Best for apps with
  multiple pages where users benefit from back/forward.
- **`"minimal"`** — chrome row collapsed to vault name + title only; no nav row;
  no Debug button. Best for single-page reading-mode apps that want to feel less
  "appy". Defaults: `vaultName, appTitle: true`, everything else off.
- **`"hidden"`** — chrome row + nav row both hidden; iframe takes the full viewport.
  A **corner `× Exit app` pill** (`position: fixed; top: 8px; right: 8px; z-index: 9999`)
  remains visible regardless. Best for immersive experiences (lightbox-first
  galleries, presentations, kiosk mode).

`hud.show.*` granular flags override the per-mode defaults. Set to `false` to hide;
omit to use the default.

### Sovereignty rail — what apps **cannot** suppress

The HUD config is for *app preferences*, not *app authority*. Three guarantees the
host enforces no matter what `app.json` says:

1. **Consent prompts always render.** When the app calls `sg.fs.delete(...)` or
   `sg.vault.create(...)` etc., the host's HUD consent overlay appears for the user
   to allow/deny — regardless of `hud.mode`.
2. **The escape pill is non-suppressible** in `mode: "hidden"`. Users always have a
   one-click way back to the vault file browser.
3. **User-side override.** Power users can set
   `localStorage['sg-app-force-show-hud'] = '1'` and reload to force `mode: "full"`
   regardless of what `app.json` requests. (Read at page-script level — not bypassable
   by app code.)

### Recommendation

Don't ship `hud` at all unless you've thought about it; `full` is the right default
for almost everything. Use `minimal` if your app is single-page reading content and
the nav row would confuse users (e.g. a long-form essay with no internal navigation).
Reach for `hidden` only when the chrome actively breaks the experience — and even
then, prefer `minimal` first.

---

## Reading other vaults (sub-vaults)

A vault can link to **other vaults** (the "vault-in-vault" feature). Linked vaults are mounted into
the file tree as folders and are **read-only**. To your app, an inner-vault file is **just another
path** — read it through the same `sg.vfs.*` API:

```js
// 'subvaults/' is where links commonly live; the mount path is the link-file name without
// the .link.json suffix. Inner-vault files appear under that path.
const txt = await sg.vfs.readText('subvaults/patient-alice/knee-score.json');
```

- **Transparent reads.** Reading a path under a linked vault **auto-opens** that vault (read-only)
  using a key the owner stored when adding the link (an `ro-links` record, or a device-saved key).
  No user prompt fires during a read. If no key is available, the read fails (`No such file`) —
  the zero-knowledge boundary holds: you can only read inner vaults you have a key for.
- **Read-only, for now.** `sg.vfs.write` to an inner-vault path is rejected. (`sg.app.writable`
  reflects the *parent* vault; inner-vault writes are not supported in this version.)
- **Listing.** `sg.vfs.list('subvaults/patient-alice')` returns the inner vault's entries **once it
  has been opened** (e.g. after the first read of a file in it, or after the user expanded it). If
  you need a guaranteed listing, read a known file first, or list the parent and read on demand.

This is the workflow that lets an app (e.g. a clinician dashboard) read across many per-user vaults
without the user ever seeing the raw vault UI.

---

## Reading history (past versions)

`sg.history.*` exposes the vault's commit history, so an app can show previous versions of a file or
folder. All of it is **read-only** and works on read-only opens.

```js
// 1) list commits (newest first; walks the first-parent chain)
const commits = await sg.history.log({ limit: 50 });
// → [{ id, parents, tree_id, timestamp_ms, message }, …]

// 2) list a folder as it was at a commit (one level)
const entries = await sg.history.list(commits[2].id, 'maps');
// → [{ path, name, dir, size }, …]

// 3) read a file's bytes at that commit
const txt = await sg.history.readText(commits[2].id, 'maps/cities.json');
const buf = await sg.history.read(commits[2].id, 'logo.png');   // ArrayBuffer

// 4) read a content-addressed object directly (e.g. a blob_id from a tree entry)
const blob = await sg.history.readBlob('obj-cas-imm-…');
```

Use it to build a "file history" view, a diff, or a "restore previous version" button (write the
old bytes back with `sg.vfs.write` in a writable vault). History currently covers the **current
vault**; reading a sub-vault's own history is a planned follow-on.

---

## Anti-patterns (and how to fix them)

### ❌ Declarative `<link>` for vault CSS

```html
<!-- BROKEN: parser fetches theme.css against blob: origin → 404 -->
<link rel="stylesheet" href="theme.css">
```

✅ Use `sg.loadCss`:

```html
<script>sg.loadCss('theme.css');</script>
```

### ❌ Declarative `<script src>` for vault JS

```html
<!-- BROKEN: parser fetches helper.js → 404 -->
<script src="helper.js"></script>
```

✅ Use `sg.loadJs`:

```html
<script>sg.loadJs('helper.js');</script>
```

### ❌ ES modules

```html
<!-- BROKEN: module loader fetches mod.js → 404 -->
<script type="module" src="mod.js"></script>
<script type="module">import { foo } from './mod.js';</script>
```

✅ Either inline as a non-module `<script>`, or read via `sg.vfs.readText` and run it (acceptable inside a sandboxed iframe — but rarely needed for demos):

```html
<script>
  sg.vfs.readText('mod.js').then(src => {
      // Run as a classic script; ESM imports won't resolve
      new Function(src)();
  });
</script>
```

For substantial dependencies, bundle into a single file before storing in the vault.

### ❌ `@import` in vault CSS

```css
/* BROKEN: CSS parser fetches base.css → 404 */
@import url("base.css");
```

✅ Concatenate the CSS files at author-time, or load them sequentially with `sg.loadCss`.

### ❌ Web Workers

```js
// BROKEN: worker loader fetches w.js → 404
const w = new Worker('w.js');
```

✅ No supported pattern today. Inline the worker logic into your main script, or wait for the [Service Worker upgrade](./service-worker-future.md).

### ❌ FOUC: visible flash of unstyled content

```html
<!-- BROKEN: page renders unstyled, then jumps when CSS arrives -->
<body>
  <h1>...</h1>
  <script>sg.loadCss('theme.css');</script>
</body>
```

✅ Hide first, reveal after load:

```html
<head>
  <style>body { display: none; }</style>
  <script>
    sg.loadCss('theme.css').then(() => { document.body.style.display = 'block'; });
  </script>
</head>
```

### ❌ Assuming `sg` exists in non-vault contexts

```js
// BROKEN if the same HTML is also viewed outside a vault
sg.loadCss('theme.css');
```

✅ Feature-detect:

```js
if (typeof sg !== 'undefined') {
    sg.loadCss('theme.css');
}
```

This matters if you author HTML that should also work as a static page when downloaded.

---

## How the live editor handles this

The vault edit-mode preview re-renders your HTML on every keystroke (debounced 600 ms). The same bridge contract applies: the live preview goes through the exact same code path as the static preview, so what you see while editing is what you'll see after saving.

If a typo accidentally introduces a declarative `<link>` or `<script src>`, the preview will show the page minus those resources (404 in iframe console). Replace with `sg.loadCss` / `sg.loadJs` to fix.

---

## Quick checklist before committing a vault HTML file

- [ ] No `<link rel="stylesheet" href="...">` to vault-relative paths
- [ ] No `<script src="...">` to vault-relative paths
- [ ] No `<iframe src="...">`, `<source src>`, `@import url()`, or ESM `import` to vault-relative paths
- [ ] Data read with `sg.vfs.read` / `readText` (**not** `fetch()` of a vault path)
- [ ] Vault-relative images get their `src` set **from JS** (not a declarative `<img src>`)
- [ ] Any CSS/JS dependencies loaded via `sg.loadCss` / `sg.loadJs`
- [ ] FOUC handled (hide-then-reveal pattern) if loading async CSS
- [ ] `sg.app.writable` checked before showing edit UI
- [ ] Sub-vault paths (e.g. `subvaults/…`) read via `sg.vfs` like any other path (read-only)
- [ ] Console shows `[sg-vfs] ready | …` log line on first render

---

## See also

- [Creating vaults-in-vaults and external-resource links](./SUB-VAULTS-AND-LINKS.md) — the `*.link.json` + `.vault/owner/ro-links.json` file formats and how to set them up from `sgit`
- [Driving a vault app's `sg.*` from Playwright](./PLAYWRIGHT-VAULT-APP-ACCESS.md) — open a vault by key, reach the app iframe, call `sg.vfs`/`sg.history` headless
- [Service Worker future architecture](./service-worker-future.md) — the planned upgrade that will lift the declarative-tag restriction
