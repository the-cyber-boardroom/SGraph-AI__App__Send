# Authoring HTML pages that run inside a vault

This guide is for anyone — human or AI — writing HTML files that will be stored inside a vault and rendered by the SGraph Send vault iframe. It documents the **calling-convention contract** that vault HTML must follow, the **runtime API** the iframe exposes (`window.sg.*`), and the **patterns and anti-patterns** for loading CSS, JS, and data.

> **Permission model (new).** Mutations (`sg.vfs.write`, `sg.fs.*`, `sg.vault.*`) are now
> **deny-by-default** and must be declared in `app.json` `permissions`; `.vault/**` is off-limits.
> Migrating an existing app? Read **[MIGRATING-TO-THE-PERMISSION-MODEL.md](MIGRATING-TO-THE-PERMISSION-MODEL.md)** first.

> **Verified against the live bridge (`app-shell.js` v0.2.3) on 2026-07-30.** Newly documented in
> this revision: `sg.append.*` (renamed from `sg.inbox.*` on 2026-06-15 — the write verb is `write`),
> `sg.on`/`sg.off` host events, the expanded `sg.vault.*` verb set (`getKey`, `setAccessToken`,
> `openApp`, `list`, `notify`), the current `vault.create(opts)` signature, and `sg.app.context`/
> `totalSize`. Earlier corrections retained: vault-relative `fetch()` is **not** auto-routed (use
> `sg.vfs.read`/`readText`); only an `img.src = …` assignment **from JS** is intercepted (a
> declarative `<img src>` in the initial HTML is **not**). `sg.sync` / `sg.auth` / `sg.ui` /
> `sg.history` / sub-vaults are documented below.

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
| `window.sg.vfs.read(path)` / `readText` / `list` / `write` / `download` | ✅ Works | Custom postMessage protocol — **the supported way to read/write/save vault data** |
| `<a href="#section">` (clicked) | ✅ Works | Fixed 2026-07-31 — the interceptor scrolls in-frame (the browser default is broken in srcdoc frames). `location.hash` assignment from JS remains banned. |
| `data-sg-native` on an anchor, or `preventDefault` in window-capture | ✅ Works | Added 2026-07-31 — sanctioned opt-out; the host never claims such clicks |
| `sg.loadCss(path)` / `sg.loadJs(path)` | ✅ Works | loaders that read vault bytes over the bridge and inject `<style>`/`<script>` |
| `img.src = 'photo.png'` (assigned **from JS**) | ✅ Works | `HTMLImageElement.prototype.src` setter is patched to decrypt + serve a `blob:` |
| `<a href="other.html">` (clicked) | ✅ Works | Click handler postMessages parent, which re-renders the iframe |
| `<a href="other.html#section">` (clicked) | ✅ Works | Fixed 2026-05-30 — the `?query`/`#fragment` is stripped before the extension check; the fragment is forwarded and scrolled-to in the new doc |
| `<a href="https://example.com">` (clicked) | ✅ Opens in a new tab | Default: a one-click host confirm opens it (no escape-sandbox). Opt into frictionless in-frame open with `permissions.externalLinks: true`. See "What the host does for you". |
| `sg.fs.*`, `sg.vault.*`, `sg.history.*`, `sg.sync.*`, `sg.auth.*`, `sg.ui.*`, `sg.state.*`, `sg.append.*`, `sg.on`/`sg.off` | ✅ Works | postMessage command protocol (see below) |

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
        read    : (path)                  => Promise<ArrayBuffer>,    // raw bytes; no read-size cap
        readText: (path)                  => Promise<string>,
        list    : (prefix)                => Promise<[{path,name,size,type}]>,
        // Save a vault file to the user's device (host-fulfilled — see "Downloading files").
        download: (path, opts?)           => Promise<{ok, path, filename, bytes}>,  // opts: {filename}
    },
    loadCss : (path) => Promise<HTMLStyleElement>,    // load + inject CSS
    loadJs  : (path) => Promise<HTMLScriptElement>,   // load + execute JS
    app: {
        context  : 'app',               // 'app' in the /en-gb/app/ surface ('preview' planned for the editor's inline preview)
        selfPath : 'demos/hub.html',    // path of the currently-open file
        writable : true,                // false for read-only (share-token / sub-vault) views
        vaultName: 'My Vault',
        vaultId  : 'abcd1234',
        fileCount: 12,
        totalSize: 0,                   // reserved (currently always 0)
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
        // Host-rendered "quick look" overlay for a vault file (NEW 2026-07-31). Same
        // permission chain as vfs.read, no confirm. PDFs work here (host origin) — they
        // are blocked in-frame. kind: 'pdf'|'image'|'video'|'audio'|'text'|'binary'.
        preview          : (path) => Promise<{ok, path, type, bytes}>,
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
        // create(opts) takes an opts OBJECT (matches mount(opts)):
        //   { label, link: {path} | false, returnKey, custody, seedFrom, accessToken }
        create  : (opts)         => Promise<{...}>,               // composed key only if returnKey
        getKey  : (ref)          => Promise<{key}>,               // custodied key re-share (always-confirm consent)
        setAccessToken: (ref, value) => Promise<{ok}>,            // value: 'inherit' | '<token>'
        openApp : (ref, opts?)   => Promise<{ok}>,                // launch a vault as an app; opts: {deepLink, target}
        list    : ()             => Promise<{vaults: [{ref_id, vault_id, label, tier}]}>,
        unlink  : (path)         => Promise<{ok: true}>,
        delete  : (ref)          => Promise<{ok: true}>,
        mount   : ({prefix, ref, label}) => Promise<{mountId}>,
        unmount : (mountId)      => Promise<{ok: true}>,
        mounts  : ()             => Promise<[{mountId, prefix, label, ref}]>,
        notify  : (mountId, name, payload) => Promise<{ok}>,      // wake a mounted child's append lane
        // Open ANOTHER vault inside an iframe in YOUR app. See "Embedding another vault".
        embed   : (mountEl, key, opts?) => Promise<{vaultName, fileCount, hasApp, iframe}>,
    },
    // Append-only transport (renamed from sg.inbox.* on 2026-06-15; the write verb is `write`).
    // Gated by app.json `permissions.append.*`. See "Receiving messages".
    append: {
        configure    : ({append_anchors})  => Promise<{...}>,
        write        : ({vault_id, append_token, payload}) => Promise<{...}>,
        list         : ({inbox, after_file_id, limit, include_content}) => Promise<{...}>,
        fetch        : ({inbox, file_ids}) => Promise<{...}>,
        markProcessed: ({inbox, file_ids}) => Promise<{...}>,
        purge        : ({folder, inbox, file_ids}) => Promise<{...}>,
    },
    // Kernel→app events (gated by app.json `host_events` allowlist).
    on : (name, cb) => void,     // e.g. sg.on('append.new-messages', cb) / 'append.error'
    off: (name, cb) => void,
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
    // Call an LLM with the VAULT'S key — which never enters your frame (NEW 2026-08-02).
    // Requires `permissions.llm.*` in app.json. See "Calling an LLM" below.
    llm: {
        available: ()               => Promise<{ok, reason?, model?, remaining?}>,
        models   : ()               => Promise<[{id, name, pricing, context}]>,   // policy-filtered
        usage    : ()               => Promise<{calls, promptTokens, completionTokens, cost, remaining}>,
        chat     : (req, onToken?)  => Promise<{content, model, finishReason, usage, cost, id, aborted}>,
        cancel   : (requestId)      => Promise<{cancelled}>,
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

> **Size limit (single write).** A single `sg.vfs.write` is capped at **~3 MB** of plaintext
> (`EFBIG`). One `write` becomes one commit → one `POST /api/vault/batch` carrying the new
> blob + new tree + commit + ref + index, all base64-encoded inside JSON. AWS Lambda URL
> Functions cap the request payload at 6 MB, base64 inflates ~1.33×, and the rest of the
> batch eats some room — so 3 MB is the conservative ceiling the host enforces. Above it,
> the write rejects with code `EFBIG` (no partial state — nothing was committed).
>
> **Reads scale further than writes.** Reads above ~4 MB use a presigned-S3 URL that bypasses
> Lambda's response cap; there's no equivalent presigned-PUT for writes yet. So an app can
> read multi-MB blobs (videos, PDFs, datasets) but can't `write` them in one call. Until
> presigned-PUT ships, large writes must be split across multiple files at the app layer.
>
> (Note: the historical "Bad encoding" cap at ~8 KB was a base64 chunking bug, fixed
> 2026-06-11. Anything ≤ 3 MB now Just Works in a single `write`.)

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

> **Bare-`#` anchors now work (fixed 2026-07-31)** — the host interceptor claims
> `<a href="#section">` clicks and scrolls in-frame (`preventDefault` + `scrollIntoView`;
> a missing target is a safe no-op). The browser default they used to fall through to is
> broken in a null-origin `srcdoc` frame (the fragment resolves against the *inherited parent
> base URL*, causing a real cross-document navigation to the vault-key screen), which is also
> why **assigning `location.hash` from JS is still BANNED** — that's srcdoc spec behaviour the
> host cannot intercept. Scroll with `element.scrollIntoView()` instead.
> (Analysis: architect review `team/roles/architect/reviews/07/30/` on the click interceptor.)

**Opting out of the interceptor (2026-07-31):** if your app wants to handle an anchor click
itself, either call `e.preventDefault()` in a **window-capture** listener (it runs before the
host's document-capture handler; the host now honours `e.defaultPrevented`), or mark the anchor
`data-sg-native` — the host will never claim clicks on such anchors (any href form, including
`.html` and external).

**What the host does for you (so your app shouldn't reinvent these):**

- **Hash anchors** — `<a href="page.html#section">` was historically broken (the `.html`
  endsWith check failed because the href ended in `#section`, the click fell through,
  the static host 403'd). Fixed 2026-05-30. The fragment is forwarded to the new srcdoc
  and applied on `DOMContentLoaded` via a postMessage from the parent. If the target id
  doesn't exist yet (content rendered later from data) the scroll is a safe no-op — the
  hazardous `location.hash` fallback that used to re-navigate the frame was removed
  2026-07-31. Apps whose anchor targets render asynchronously should carry the target in
  an `sg.state.*` stash and scroll after render.
- **External links** (`http://`, `https://`, protocol-relative `//`) open in a new tab.
  Don't add `target="_blank"` — the host handles it. **By default** (least privilege) the
  app frame has **no** popup/escape-sandbox capability: clicking an external link surfaces a
  one-click **"This app wants to open `<url>` — Open ↗"** confirm on the host chrome, and the
  host opens it. This also means the user sees where a link leads before it opens.
  If your app opens external links often and you want the **frictionless** in-frame open
  (no confirm), declare it:

  ```json
  { "permissions": { "externalLinks": true } }
  ```

  That grants the frame `allow-popups allow-popups-to-escape-sandbox`. Only opt in if your
  app genuinely needs it — it's the one grant that lets the frame open an unsandboxed window,
  so default-off is the safe posture (see "Embedding another vault" for the same principle).
- **`mailto:` and `javascript:`** are passed through unchanged.
- **Pure-fragment links** (`<a href="#section">`) are claimed by the interceptor and scrolled
  in-frame (fixed 2026-07-31 — the browser default is a broken cross-document navigation in a
  null-origin srcdoc frame). A missing target is a no-op. Your app can still take over any
  anchor with `data-sg-native` or a window-capture `preventDefault`.
- **Query strings on vault links** (`<a href="page.html?node=42">`) are currently
  **unsupported** — the query is not stripped before the file lookup, so the link lands on the
  broken-link overlay. Carry cross-page state in the `#fragment` (delivered to the new doc) or
  an `sg.state.*` stash instead.
- **Friendly 404** — clicks pointing to files that don't exist (or are inside the
  `.vault/**` floor) land on a host-rendered "Page not found in this vault" overlay
  with a back arrow. You don't need to handle broken-link routing yourself.
- **Blank-app detection** — if your entry file is empty, the host shows a clear
  "Entry file is empty" error instead of a blank screen. And ~2.5 s after load, if
  your `<body>` is still showing nothing (hidden via `display:none`/`visibility`/
  `opacity:0`, has no children, or rendered zero-height content) the host surfaces a
  *"App loaded but is showing nothing…"* hint on the HUD. A working app that has
  painted by then never trips this. **If your app legitimately reveals later than
  2.5 s** (heavy async init), paint *something* — even a spinner — before then so the
  hint doesn't fire. (Errors thrown during init are already caught by the host's
  `window.onerror` bridge and surfaced as an error toast — you don't need to do that
  yourself.)
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
      "activity":   true,
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
- **`"minimal"`** — chrome row collapsed to vault name + title + **Open Vault** button;
  no nav row; no Debug button. Best for single-page reading-mode apps that want to feel
  less "appy" while still giving the user a visible way back. Defaults:
  `vaultName, appTitle, openVault: true`, everything else off. (Copy Link / Print / Debug
  now live behind a `⋯` overflow button in `full` mode — they don't need their own slots.)
- **`"hidden"`** — chrome row + nav row both hidden; iframe takes the full viewport.
  A **corner `× Exit app` pill** (`position: fixed; top: 8px; right: 8px; z-index: 9999`)
  remains visible regardless. Best for immersive experiences (lightbox-first
  galleries, presentations, kiosk mode).
- **`"none"`** — like `hidden`, but **the escape pill is gone too**. The app is visually
  indistinguishable from a standalone web page; the **only** way back to the vault is to
  edit the URL. Use this deliberately for a patient/end-user-facing surface (e.g. a
  check-in form) where *any* host chrome — even a corner pill — would break the illusion
  that this is "just an app". Because there's no visual clue, reach for `none` only when
  that invisibility is the point; prefer `hidden` otherwise. Consent prompts still render
  (see the sovereignty rail).

`hud.show.*` granular flags override the per-mode defaults. Set to `false` to hide;
omit to use the default.

**`activity` — the file-activity meter** (`full`-default on, `minimal`/`hidden`/`none` off).
A compact `⇅ R N  W N` chip in the top row that tallies the files this app has **read**
(`vfs.read`/`vfs.list`) vs **written** (`vfs.write`/`fs.move`/`fs.delete`/`fs.mkdir`) this
session, flashes green/red per op, and expands on click to the last 15 ops (path · size ·
ms · outcome). It's a transparency surface for power users — *"what is this app actually
touching?"* — so it's only shown in `full` (the mode power users see). Purely passive; it
doesn't change what the app can do.

### Sovereignty rail — what apps **cannot** suppress

The HUD config is for *app preferences*, not *app authority*. Three guarantees the
host enforces no matter what `app.json` says:

1. **Consent prompts always render.** When the app calls `sg.fs.delete(...)` or
   `sg.vault.create(...)` etc., the host's consent bar appears for the user to allow/deny
   — **regardless of `hud.mode`, including `none`**. The consent bar is a full-width
   sibling of the chrome row (not inside it), so hiding the chrome never hides consent.
2. **The escape pill is non-suppressible** in `mode: "hidden"`. Users always have a
   one-click way back to the vault file browser. (`mode: "none"` *does* drop the pill by
   design — that's the whole point of `none` — so for those apps the user-side override
   below is the escape hatch.)
3. **User-side override.** Power users can set
   `localStorage['sg-app-force-show-hud'] = '1'` and reload to force `mode: "full"`
   regardless of what `app.json` requests — this upgrades **both `hidden` and `none`**, so
   a curious user can always reveal the chrome. (Read at page-script level — not bypassable
   by app code.)

### Recommendation

Don't ship `hud` at all unless you've thought about it; `full` is the right default
for almost everything. Use `minimal` if your app is single-page reading content and
the nav row would confuse users (e.g. a long-form essay with no internal navigation).
Reach for `hidden` only when the chrome actively breaks the experience — and even
then, prefer `minimal` first.

---

## Running on static storage (GitHub Pages / S3)

The **same app HTML** runs against the live FastAPI backend or a 100% static file host —
the app only talks to `window.sg` and never knows the difference. Reads are deterministic
GETs; a static host is read-only (`sg.app.writable === false`). Set `window.SG_STATIC = true`
+ `window.SG_ENDPOINT = '<static base>'` and open the vault without a token. Full guide:
**[HOSTING-ON-STATIC-STORAGE.md](HOSTING-ON-STATIC-STORAGE.md)**.

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

## Embedding another vault inside your app (`sg.vault.embed`)

Sometimes you don't want to *read* another vault's files — you want to **show the whole
other vault** (its app, its files) inside a panel in your app. A doctor console opening
each patient's vault is the canonical case. Use **`sg.vault.embed`**:

```js
const pane = document.querySelector('#patient-pane');
const info = await sg.vault.embed(pane, patientKey);
// → { vaultName, fileCount, hasApp, iframe }
```

That's the whole thing. `sg.vault.embed` creates the iframe, runs the key handshake over
`postMessage` (**the key never touches the URL or storage**), uses the **minimum sandbox
privileges**, and resolves once the embedded vault is interactive.

`key` is the full vault key (`passphrase:vault-id` — the same string that follows `#` in a
share link). Options (all optional):

| option | default | meaning |
|---|---|---|
| `host` | the host your app was served from | e.g. `'https://dev.vault.sgraph.ai'` |
| `surface` | `'app'` | `'app'` runs the embedded vault's app; `'vault'` is the file browser (file-browser embed is a planned follow-on) |
| `deepLink` | — | a file path to open inside the embedded vault |
| `mode` | `'auto'` | `'app'` / `'vault'` / `'auto'` |
| `sandbox` | *(none)* | extra sandbox tokens **beyond `allow-scripts`** — narrow opt-ins only (see below) |
| `timeoutMs` | `14000` | handshake timeout |

### Security — least privilege by default

The embedded iframe is sandboxed with **`allow-scripts` only**. That's all the handshake
and rendering need, and it keeps the vault in an opaque origin with no storage. The host
**refuses** the two dangerous tokens even if you ask for them:

- **`allow-same-origin`** — would dissolve the isolation boundary (the embedded vault could
  read your app's storage/DOM). Never granted.
- **`allow-popups-to-escape-sandbox`** — the embedded frame renders HTML apps authored by
  *whoever shared that vault*; this token would let that content open a **full-privilege,
  unsandboxed** window. Never granted.

If a specific in-vault action needs more, add the **narrow** token for *that action* via
`opts.sandbox` — `['downloads']` to let the embedded vault download a file, `['popups']`
for new-tab links (they stay sandboxed), `['modals']` for `window.print()`/dialogs. Reach
for the smallest set that works; never the escape token.

### Don't hand-roll the handshake

Earlier this required ~70 lines of `postMessage` plumbing plus a list of gotchas (opaque
origins, `parent=null`, target-origin rules). `sg.vault.embed` is the platform-maintained,
tested version of exactly that — **don't** point an iframe at `https://host/#<key>` (that's
the entry-form flow and depends on `localStorage`, which is blocked in a sandboxed app).
Always keep an `<a href="https://host/#<key>" target="_blank">` **Open in new tab** link as a
fallback for environments where framing is blocked by the host's CSP.

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

## Device-local app state (`sg.state.*`)

Your app runs in a **null-origin sandboxed iframe**, so it has **no `localStorage` of its own** —
`window.localStorage` throws on an opaque origin. When you need to remember something small on *this*
device (theme choice, panel widths, a "don't show this again" flag, the last tab the user was on),
`sg.state.*` gives you a key/value store **without a vault write**. Under the hood it postMessages the
request to the top-level kernel, which owns the real `localStorage`, reads/writes on your behalf, and
replies — the same bridge every other `sg.*` call uses. You never touch storage directly.

```js
await sg.state.set('theme', 'dark');          // value is JSON-encoded (any JSON-serialisable value)
await sg.state.set('layout', { cols: 3, sort: 'name' });

const theme  = await sg.state.get('theme');    // → 'dark'  (null if never set)
const layout = await sg.state.get('layout');   // → { cols: 3, sort: 'name' }

const keys   = await sg.state.keys();          // → ['theme', 'layout']  (just the key part)
await sg.state.remove('theme');
await sg.state.clear();                         // wipes only THIS app's keys → { ok: true, removed: N }
```

**Isolation.** Every key is stored under `sg-app-state:<vaultId>:<appEntryPath>:<key>`, so state is
scoped **per-vault and per-app-entry-path**. One vault's apps can't read another's, and `clear()`
only removes your app's slice — it never touches other apps' state. `keys()` returns the
un-namespaced key part, so you read back exactly what you passed to `set()`.

**Limits & safety.**

- **64 KiB per key** (the JSON-encoded value). It's for *preferences*, not documents — a larger value
  is rejected with `value too large (max 64 KiB)`.
- `vaultId` is a **derived, non-secret** identifier — the vault **key is never** written to
  localStorage. Don't put secrets (vault keys, access tokens) in `sg.state.*`.
- Every op is wrapped in try/catch on the host side, so a quota or parse error returns a rejected
  promise rather than breaking the bridge.

### `sg.state.*` vs `sg.fs.write('.app-state/…')` — pick the right one

This is the decision that trips people up. They are **not** interchangeable:

| You want state that… | Use | Persistence | Travels with the vault? |
|---|---|---|---|
| Is a per-device **preference** (theme, panel sizes, dismissals) | **`sg.state.*`** | Kernel `localStorage` on **this browser** | ❌ No — device-local only |
| Should **sync across devices** and be visible to anyone opening the same vault key | **`sg.fs.write('.app-state/…')`** | A real, encrypted **vault write** (a commit) | ✅ Yes — it *is* vault content |

Rule of thumb: if losing it when the user switches browsers would be **fine** (or even expected),
use `sg.state.*`. If losing it would be a **bug**, write it into the vault. Reach for `sg.state.*`
specifically to avoid a vault commit on every trivial UI toggle.

> **Why this exists as a separate namespace.** The device-local-prefs case deliberately deviates from
> the "everything is a vault file" doctrine: a theme toggle shouldn't create a commit. Recorded in
> `team/comms/changelog/05/30/changelog__app-state-print-rpc.md`.

**No permission grant required.** Unlike `sg.fs.*` / `sg.vault.*`, `sg.state.*` needs no `app.json`
`permissions` entry and no consent overlay — it's sandboxed to your own namespace in device-local
storage and can't touch the vault or other apps. It works on **read-only opens too** (share-token /
sub-vault views), since it never writes to the vault.

---

## Receiving messages (`sg.append.*` + `sg.on`)

> **Renamed 2026-06-15** (v0.32.7): this transport was previously `sg.inbox.*` with an `append`
> verb. It is now **`sg.append.*`** and the write verb is **`write`**. Update any older app code.

The append transport lets a vault receive messages/files from other agents or vaults through an
**append-only lane** that lives outside the version-controlled commit tree (raw vault-pointer API,
not the commit/push flow). The kernel holds the keys and attaches the gate header per verb; your
`app.json` `permissions.append.*` grants decide which verbs your app can call. Read-only sessions
fail closed.

```js
// Verbs (all take a single opts object — see the API block above for fields):
await sg.append.configure({ append_anchors: [...] });
await sg.append.write({ vault_id, append_token, payload });      // send INTO another vault's lane
const { entries } = await sg.append.list({ limit: 20 });
await sg.append.fetch({ file_ids: [...] });
await sg.append.markProcessed({ file_ids: [...] });
await sg.append.purge({ file_ids: [...] });

// Event push — declare in app.json: "host_events": ["append.new-messages", "append.error"]
sg.on('append.new-messages', (evt) => { /* {total, per_anchor, entries, new_count, trigger} */ });
sg.on('append.error',        (evt) => { /* {code, message, http?, trigger} */ });
```

The kernel's checker runs on tab focus and app open — your app does not poll; it declares the
`host_events` allowlist, subscribes with `sg.on`, and reacts.

---

## Calling an LLM (`sg.llm.*`) — NEW 2026-08-02

Your app can call a language model **without ever holding an API key**. The key lives in
`.vault/llm/config.json` (inside the permission floor — your app cannot read it), and the host
makes the call on your behalf. You send messages and receive text.

### 1. Declare the grants

Default-deny, like every other capability. In `app.json`:

```json
{
  "entry": "index.html",
  "permissions": {
    "llm": { "chat": true, "models": true, "usage": true }
  }
}
```

`chat` is the one that spends money; `models` and `usage` are read-only. Grant only what you use.

### 2. Check availability BEFORE you render a chat UI

`sg.llm.available()` is not optional politeness. Unlike other namespaces, LLM access depends on
*runtime* state: whether the vault has a key configured, whether this is a read-only session,
whether the budget is spent. Ask first, then decide what to draw.

```js
const a = await sg.llm.available();
if (!a.ok) {
    // 'ENOKEY'  — no key configured for this vault (tell the user: Settings → AI models)
    // 'EPERM'   — this app wasn't granted permissions.llm.chat
    // 'EREADONLY' — owner-sealed key, and this is a read-only session
    showFallbackUI(a.reason);
    return;
}
console.log('ready:', a.model, 'remaining:', a.remaining);   // {calls, cost} — null = uncapped
```

### 3. Chat, with streaming

```js
const res = await sg.llm.chat(
    { messages: [{ role: 'user', content: 'Summarise this vault in one line.' }] },
    (delta, acc) => { out.textContent = acc; }        // optional — called as text arrives
);
console.log(res.content, res.usage, res.cost, res.id);
```

Three properties worth relying on:

- **The terminal reply is authoritative.** An app that ignores `onToken` entirely still gets the
  complete `content`. Deltas are a UX affordance, never the source of truth.
- **Deltas carry only the increment** (`delta`), plus the running `acc` for convenience. The host
  coalesces them on a ~50 ms timer, so you get readable chunks rather than a postMessage per token.
- **`cost` is labelled**: `{value, source, estimated}`. `estimated: true` means it was computed
  from token counts × list price, not billed. Render estimates with a `~`. Never show one as a bill.

Optional request fields: `model`, `maxTokens`, `temperature`, `topP`, `stream: false`.

### 4. Cancel a call in flight

The promise carries the request id:

```js
const p = sg.llm.chat({ messages }, onToken);
stopBtn.onclick = () => sg.llm.cancel(p.requestId);
try { await p; } catch (e) { if (e.code === 'EABORT') { /* partial text is already rendered */ } }
```

### 5. Show what it costs

```js
const u = await sg.llm.usage();
meter.textContent = `${u.calls} calls · $${u.cost.toFixed(4)} · ${u.remaining.cost ?? '∞'} left`;
```

`usage()` reports the **whole session**, including calls made by the vault UI's own chat panel —
one bill per session, not one per surface.

### What the host does that you don't have to

| Concern | Who handles it |
|---|---|
| Holding the API key | Host. It is never in your frame, your bundle, or any message you receive. |
| Which models you may use | Host — `models()` is already filtered by the vault's allow-list, so a picker you build from it is automatically correct. |
| Spend caps | Host. `maxCostPerSession` / `maxCallsPerSession` are enforced before the call; you get `EBUDGET`. |
| `maxTokens` | Host **clamps** it to the vault policy. Asking for more is not an error, it is just capped. |
| Consent | Host. The first `chat()` raises a HUD prompt the user must accept; declining gives you `ECONSENT`. |
| Cost reconciliation | Host, two-source (stream `usage.cost`, then the authoritative `/generation` lookup). |

### Error codes

`EPERM` (no grant) · `ECONSENT` (user declined) · `ENOKEY` (no key configured) ·
`EREADONLY` (owner-sealed key, read-only session) · `EBUDGET` (cap reached) ·
`EMODEL` (model not in the allow-list, or none selected) · `EABORT` (cancelled) ·
`EPROTO` (upstream failure). They arrive as `err.code`, so branch on that rather than on message text.

### What this is not

There is no tool-calling loop. `sg.llm.chat` is a **reader**: it takes messages and returns text.
If you want the model to act on the vault, *your app* decides what to do with the reply and calls
`sg.vfs.*` / `sg.fs.*` itself — under the grants you already declared. That separation is
deliberate: the LLM never gets ambient authority over the vault.

> **Honest limitation.** The key still lives in the vault, so sharing a vault key still shares the
> credential with anyone who can open it. Short-lived minted credentials are planned (Phase 4) and
> would remove that; until then, treat a vault with an AI key configured as a vault that carries a
> secret.

---

## Downloading files (`sg.vfs.download`) — NEW 2026-07-31

The sanctioned way to put a vault file in the user's Downloads folder:

```js
await sg.vfs.download('exports/report.pdf');                          // saves as report.pdf
await sg.vfs.download('exports/report.pdf', { filename: 'EU-AI-Act.pdf' });
// → {ok: true, path, filename, bytes}   ·   rejects: ENOENT / EPERM / EPROTECTED /
//   'Download not approved' (user dismissed the confirm)
```

**How it works — and why you don't need `allow-downloads`.** The bytes travel the same guarded
read path as `sg.vfs.read` (floor → mounts → `fs.read` grant), but the `<a download>` click
happens in the **host document** (real origin, unsandboxed). The app frame's sandbox is
untouched. This is deliberate: a blob-URL + programmatic-anchor download **inside** the app
frame is silently dropped by Chromium because the sandbox has no `allow-downloads` token —
don't build that workaround, call `sg.vfs.download`.

**Consent.** Same model as external links: by default each call surfaces a one-click HUD
confirm naming the file and size ("This app wants to save a file to your device"); dismissing
rejects the promise. Declare `"permissions": { "downloads": true }` in `app.json` for
frictionless saves (e.g. a downloads page where saving is the whole point).

**Related contracts, stated explicitly:**

- `sg.vfs.read(path)` returns a raw **`ArrayBuffer`** (postMessage structured clone). There is
  **no read-size cap** — the 3 MB `EFBIG` guard is write-only. Errors: rejection with message
  `No such file: <path>`, or `EPERM` / `EPROTECTED` codes.
- **Direct vault-file URLs are banned in app markup.** `<a href="/exports/x.pdf" download>` or
  `<iframe src="/exports/x.pdf">` cannot work — vault files are encrypted objects, not URLs;
  the href resolves against the static host and answers `AccessDenied`. For inline **images**,
  read the bytes over the bridge and use a blob URL (or just assign `img.src` — the bridge
  patches it). For PDFs, see the next section — a blob iframe is NOT enough.

---

## Displaying PDFs inline — verified 2026-07-31

The obvious pattern — `sg.vfs.read` → `Blob` → `URL.createObjectURL` → `<iframe src>` —
**does not work in App Mode**: Chromium refuses to load its PDF viewer inside a sandboxed
frame that lacks `allow-same-origin` (you get the grey sad-document placeholder). Verified
empirically with the exact App Mode sandbox (`allow-scripts allow-forms`): identical markup
renders fine unsandboxed, is blocked in-frame. This is also why the same blob-iframe pattern
*does* work in the host's own file-preview overlay (`vault-file-preview`) — that surface runs
at the real origin. There is no sandbox token short of `allow-same-origin` (never granted —
it would collapse the app isolation boundary) that re-enables the viewer.

What actually works, in order of preference:

0. **`sg.ui.preview(path)` — one call, host-fulfilled (NEW 2026-07-31, the default choice).**
   ```js
   await sg.ui.preview('docs/report.pdf');   // → {ok, path, type: 'pdf', bytes}
   ```
   The host reads the bytes through the vfs.read permission chain and renders a modal
   quick-look overlay in **its own document** — real origin, so Chrome's native PDF viewer
   works (toolbar, zoom, text selection). Also previews images, video, audio, and text.
   No grant and no confirm: the bytes never leave the browser, and the overlay is host DOM
   the app can't fake or suppress (user closes via ✕ / Escape / backdrop). One overlay at a
   time — a new call replaces the current one. Errors mirror `vfs.read`
   (`ENOENT`/`EPERM`/`EPROTECTED`). Use the options below only when the PDF must render
   *inside your own layout* rather than as an overlay:

1. **PDF.js rendered to canvas** — the real in-frame PDF experience:
   ```js
   await sg.loadJs('assets/pdf.min.js');            // classic/UMD build — ESM import() 404s
   const wsrc = await sg.vfs.readText('assets/pdf.worker.min.js');
   pdfjsLib.GlobalWorkerOptions.workerSrc =
       URL.createObjectURL(new Blob([wsrc], { type: 'text/javascript' }));   // blob worker
   const data = await sg.vfs.read('docs/report.pdf');
   const pdf  = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
   const page = await pdf.getPage(1);
   const vp   = page.getViewport({ scale: 1.5 });
   canvas.width = vp.width; canvas.height = vp.height;
   await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
   ```
   (`new Worker('path')` against a vault path 404s — hence the blob worker; PDF.js also
   falls back to a main-thread "fake worker" if you skip `workerSrc`.)
2. **Pre-rasterise at build time** (`pdftoppm` / PyMuPDF → one image per page in the vault,
   rendered via `img.src`) — zero runtime dependencies, loses text selection.
3. **`sg.vfs.download('docs/report.pdf')`** — hand the file to the OS viewer instead of
   rendering inline. One call, host-fulfilled (see "Downloading files").

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
