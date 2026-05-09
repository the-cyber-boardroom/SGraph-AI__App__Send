# Authoring HTML pages that run inside a vault

This guide is for anyone — human or AI — writing HTML files that will be stored inside a vault and rendered by the SGraph Send vault iframe. It documents the **calling-convention contract** that vault HTML must follow, the **runtime API** the iframe exposes (`window.sg.*`), and the **patterns and anti-patterns** for loading CSS, JS, and data.

> **TL;DR.** Inside a vault iframe, you cannot write `<link rel="stylesheet" href="theme.css">` or `<script src="helper.js"></script>` against vault-relative paths. Instead, call `sg.loadCss('theme.css')` or `sg.loadJs('helper.js')` at runtime. Anything you fetch from JS (`fetch('cities.json')`, `img.src = 'photo.png'`, `<a href="other.html">`) works automatically.

---

## Why this contract exists

The vault iframe is loaded from a `blob:` URL. Vault files don't live on a web server — they live in the user's browser, decrypted on-device, and served to the iframe via `postMessage` between iframe and parent.

When the browser parses your HTML, it processes declarative resource references **before any JavaScript runs**:

- `<link rel="stylesheet" href="theme.css">` — the HTML parser fetches `theme.css` immediately, against the blob URL's opaque origin. Result: 404.
- `<script src="helper.js">` — same.
- `<iframe src="page.html">`, `<source src="clip.mp4">`, `@import url(...)` inside CSS — same family.

Our bridge script (which routes vault file lookups through the parent) runs **inside** your iframe — it cannot intercept fetches the browser fires before scripts run. There is no way to fix this from inside the iframe without server-level help.

The fix is the contract below: **load CSS and JS at runtime via `fetch`-based loaders**. Then the bridge intercepts the fetch and serves the vault bytes.

A future architectural upgrade ([Service Worker](./service-worker-future.md)) will lift this restriction. Until then, follow the contract.

---

## What works automatically

Anything that goes through a JavaScript API works without modification:

| Pattern | Status | Why |
|---|---|---|
| `fetch('cities.json')` | ✅ Works | `window.fetch` is patched to route through the bridge |
| `fetch('helper.js').then(r => r.text())` | ✅ Works | Same |
| `img.src = 'photo.png'` (from JS) | ✅ Works | `HTMLImageElement.prototype.src` setter is patched |
| `<img src="photo.png">` (in initial HTML) | ✅ Works | A MutationObserver re-routes IMG nodes through the patched setter |
| `<a href="other.html">` (clicked) | ✅ Works | Click handler postMessages parent, which re-renders the iframe |
| `window.sg.vfs.read(path)` / `readText` / `list` / `write` | ✅ Works | Custom postMessage protocol |

If you stick to these patterns, your page just works.

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
| `XMLHttpRequest` | ❌ Not patched | Use `fetch` instead |

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
        selfPath: 'demos/hub.html',     // path of the currently-open file
        writable: true,                 // false for read-only (share-token) views
    },
};
```

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
[sg-vfs] window.sg ready | writable=true | loaders: sg.loadCss, sg.loadJs
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
      .then(() => { document.body.style.display = ''; })
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
- Use `Promise.all` to load independent assets in parallel.
- Use chained `.then` for assets that depend on each other (e.g. `app.js` depends on `chart-lib.js` already being on the page).
- The loaders inject `<style>` / `<script>` elements into `document.head` with a `data-sg-loaded="<path>"` attribute, so you can inspect them in DevTools.

### 3. Reading data files at runtime

`fetch` works directly:

```js
fetch('cities.json')
    .then(r => r.json())
    .then(data => render(data));
```

No special API needed — the bridge intercepts every `fetch` whose URL is not absolute (`http://`, `//`, `data:`, `blob:`, `#...`).

You can also use the `sg.vfs.*` methods for explicit semantics:

```js
sg.vfs.readText('config.json').then(JSON.parse).then(render);
```

### 4. Writing data files (writable vaults only)

```js
const data = { excitement: 'high', when: new Date().toISOString() };
await sg.vfs.write('responses/2026-05-09.json', JSON.stringify(data, null, 2));
```

`sg.vfs.write` accepts `string | Uint8Array | ArrayBuffer`. Strings are UTF-8 encoded.

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
```

External links and `mailto:` / `#fragment` / `javascript:` are passed through unchanged.

### 6. Images

Both `<img src="photo.png">` in markup and `img.src = 'photo.png'` from JS work. The bridge handles both via setter override + MutationObserver.

```html
<img src="cover.jpg" alt="Cover">
<script>
  const el = document.createElement('img');
  el.src = 'avatar.png';   // also works
  document.body.appendChild(el);
</script>
```

Note: `<picture>` `<source srcset>` is **not** intercepted today. Use a single `<img src>` if you need vault-relative images.

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

✅ Either inline as a non-module `<script>`, or fetch and `eval` (acceptable inside a sandboxed iframe — but rarely needed for demos):

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
    sg.loadCss('theme.css').then(() => { document.body.style.display = ''; });
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
- [ ] Any CSS/JS dependencies loaded via `sg.loadCss` / `sg.loadJs`
- [ ] FOUC handled (hide-then-reveal pattern) if loading async CSS
- [ ] `sg.app.writable` checked before showing edit UI
- [ ] Console shows `[sg-vfs] window.sg ready` log line on first render

---

## See also

- [Service Worker future architecture](./service-worker-future.md) — the planned upgrade that will lift the declarative-tag restriction
