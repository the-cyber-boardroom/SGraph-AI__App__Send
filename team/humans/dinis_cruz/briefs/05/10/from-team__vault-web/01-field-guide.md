# Vault iframe field guide

For Claude sessions building or modifying pages that run inside an SG/Vault
iframe. Read this before you touch a vault page. Every rule here came out of
debugging real failures — the patterns are not aesthetic preferences, they
are what works.

## What's special about a vault iframe

A vault page is HTML, CSS and JavaScript stored as encrypted blobs inside the
vault. When the user opens the page, the vault runtime instantiates an iframe
and streams the decrypted page content into it. Two things follow from this:

- **The iframe origin is the vault host's server root.** `location.href`
  inside the iframe is something like `http://localhost:10067/` or the
  equivalent on the production host. It is **not** the path of the file you
  loaded. Treat `location.*` as opaque — it does not tell you where you are
  in the vault tree.
- **`<link href="…">` and `<script src="…">` tags fail.** The HTML parser
  fires those resource requests against the iframe origin before the vault
  bridge has installed its `fetch` interceptor, so they 404 against a server
  that has no real files at those paths. Resources must be loaded at runtime
  via `sg.loadCss` / `sg.loadJs`.

The vault bridge exposes a global `sg` object inside the iframe with three
namespaces:

| Namespace | Purpose |
| --- | --- |
| `sg.loadCss(path)` / `sg.loadJs(path)` | Inject vault-stored stylesheets and scripts at runtime. |
| `sg.vfs.*` | Read, write, list, (eventually) delete files in the vault's encrypted file system. |
| `sg.app.*` | Metadata about the running page — most importantly `selfPath` and `writable`. |

Everything below assumes you are inside the iframe. None of these globals
exist in the parent page, including the browser DevTools console by default
(see "DevTools" at the end).

## Page skeleton

Every interactive vault page follows the same skeleton. Copy this verbatim
and adapt the loaded resources.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>My vault page</title>
    <style>
        /* FOUC prevention — keep the body hidden until styles are ready */
        body.loading { visibility: hidden; }
    </style>
    <script>
        Promise.all([
            sg.loadCss('../_shared/poc-styles.css'),
            sg.loadCss('style.css'),
            sg.loadJs('app.js')
        ])
        .then(() => { document.body.classList.remove('loading'); })
        .catch(err => {
            console.error('[my-page] load failed:', err);
            document.body.classList.remove('loading');   // never trap on a blank screen
        });
    </script>
</head>
<body class="loading">
    <!-- page content -->
</body>
</html>
```

The four non-negotiable elements:

1. The `body.loading { visibility: hidden; }` rule sits in an inline
   `<style>` so it applies the moment the parser sees it, before any CSS
   loads.
2. `<body class="loading">` wears that class from the start.
3. The head script kicks off `Promise.all` over every CSS and JS dependency.
4. The `.catch` removes the `loading` class on error — a failed load must
   never leave the user staring at a blank page.

`sg.loadCss` returns a promise that resolves when the stylesheet has been
injected as a `<style>` tag in `<head>`. `sg.loadJs` resolves after the
script has been injected as `<script>` and **executed** — so anything the
script attaches to `window` is available at the next tick.

If you need strict ordering (say, `app.js` depends on `utils.js` having
attached `window.Utils`), chain the loads instead of running them in
parallel:

```js
sg.loadJs('utils.js')
  .then(() => sg.loadJs('app.js'))
  .then(() => document.body.classList.remove('loading'));
```

## Path resolution — the most important rule

`sg.vfs` operates on **vault-absolute paths** that start with `/` and are
rooted at the vault's top-level folder. They have nothing to do with
`location.pathname` or relative URLs.

The correct way to compute the current page's folder is `sg.app.selfPath`:

```js
function derivePocBase() {
    try {
        if (typeof sg !== 'undefined' && sg.app && sg.app.selfPath) {
            // sg.app.selfPath is e.g. 'poc-09-vfs-lab/index.html'
            const dir = sg.app.selfPath.replace(/[^/]*$/, '');   // 'poc-09-vfs-lab/'
            return '/' + dir.replace(/^\//, '');                 // '/poc-09-vfs-lab/'
        }
    } catch {}
    return '/poc-09-vfs-lab/';   // hardcoded fallback for the specific folder
}

const POC_BASE = derivePocBase();          // '/poc-09-vfs-lab/'
const DATA_DIR = POC_BASE + 'data/';       // '/poc-09-vfs-lab/data/'
```

Do not use `location.pathname` for this. Inside the iframe it is always `/`.
Do not use `new URL(location.href).pathname` either — same result. The
file's place in the vault tree is only knowable through `sg.app.selfPath`.

`sg.loadCss` and `sg.loadJs` do accept relative paths (they resolve against
the loading page's vault folder), so `sg.loadCss('style.css')` works fine in
the head script. But `sg.vfs` calls always need the absolute form.

## Writing files

`sg.vfs.write(path, data)` accepts strings, `ArrayBuffer`s and
`Uint8Array`s. Folders in the path are created on demand. Existing files
are overwritten — there is no append mode.

```js
// String
await sg.vfs.write('/my-app/notes/hello.txt', 'hi');

// JSON
await sg.vfs.write(
    '/my-app/data/config.json',
    JSON.stringify({ id: 1, items: [] }, null, 2)
);

// Binary
const bytes = new Uint8Array([0x53, 0x47]);
await sg.vfs.write('/my-app/data/blob.bin', bytes);
```

The promise resolves to an object like `{ path, size }` with the file's
canonical path and byte size. The vault commits the change as a separate
SGit commit per write — every `sg.vfs.write` shows up in the vault's
history.

Before writing, check `sg.app.writable`. A read-only session (shared
snapshot, presentation mode, unauthenticated visitor) will throw on
`sg.vfs.write` calls. Hide write UI in that case:

```js
if (!sg.app.writable) {
    showReadOnlyMessage();
    return;
}
```

## Reading files

There are two read APIs for text and one for bytes:

```js
// Standard fetch — bridge-intercepted for relative URLs
const data = await fetch('data.json').then(r => r.json());

// Explicit text read — returns a UTF-8 string
const text = await sg.vfs.readText('/my-app/data/config.json');

// Binary read — returns an ArrayBuffer
const buf  = await sg.vfs.read('/my-app/data/blob.bin');
const arr  = new Uint8Array(buf);
```

`fetch` accepts relative paths because the vault bridge resolves them
against the page's folder. `sg.vfs.readText` and `sg.vfs.read` need the
absolute path.

**Path-form gotcha:** in some current builds `sg.vfs.readText` rejects
absolute paths with a leading slash and throws `Failed to parse URL`. If
you hit that error, fall back to the slash-stripped form:

```js
async function safeReadText(absPath) {
    try {
        return await sg.vfs.readText(absPath);
    } catch (err) {
        if (/parse URL/i.test(err.message)) {
            // try without leading slash
            return await sg.vfs.readText(absPath.replace(/^\//, ''));
        }
        throw err;
    }
}
```

This was test 05 in `poc-09-vfs-lab` — `write('/path/...')` accepts the
leading slash but `readText('/path/...')` doesn't. The asymmetry is real,
the `safeReadText` shim is the workaround.

## Listing folders

`sg.vfs.list(path)` returns an array of entries:

```js
const entries = await sg.vfs.list('/my-app/data/');
// → [
//     { path: 'my-app/data/',          name: 'my-app/data/',          type: 'folder', size: 0 },
//     { path: 'my-app/data/config.json', name: 'my-app/data/config.json', size: 142 }
//   ]
```

Notes that bit us:

- The first entry is the directory itself, with `type: 'folder'`. Filter it
  out unless you want it.
- `path` and `name` are returned as full vault paths **without** a leading
  slash. To get a bare filename, strip everything up to the last `/`.
- The path argument **must** be vault-absolute and start with `/`. Relative
  paths like `'data/'` silently return `[]`. This was the cause of the
  misplaced `http:/localhost:10067/responses/...` folder bug in POC-08 —
  the path was wrong, the folder was created at the wrong place, and there
  was no error.

The canonical listing helper:

```js
async function listFiles(absDir) {
    let entries;
    try {
        entries = await sg.vfs.list(absDir);
    } catch {
        return [];                              // folder may not exist yet
    }
    if (!Array.isArray(entries)) return [];
    return entries
        .filter(e => e && e.type !== 'folder')
        .map(e => (e.name || e.path || '').replace(/^.*\//, ''))
        .filter(Boolean);
}
```

## Local-first model

Writes through `sg.vfs` go to the **browser's local working copy** of the
vault. They are not on the server until someone runs `sgit commit` and
`sgit push`. If the page is reloaded directly from a fresh URL, those local
writes are gone unless they have been pushed.

This matters for two reasons:

- A submit-and-reload flow will appear to lose data unless the writes are
  committed. Surface this in the UI: "edits are local until you push".
- Two users editing the same vault from different machines will not see
  each other's writes until both push and pull. There is no real-time
  sync inside `sg.vfs`.

## DevTools console

The `sg` object lives **inside the vault iframe**, not the top page. To run
`sg.vfs.*` calls from the browser console you must switch the console's
execution context. In Chromium DevTools the dropdown next to the filter box
shows `top ▾` by default; click it and pick the vault iframe (it usually
shows up as a `blob:` or vault-host URL). After that:

```js
sg.app.selfPath
await sg.vfs.list('/my-app/data/')
await sg.vfs.readText('/my-app/data/config.json')
```

…all work. This is the single fastest way to ground-truth what a vault API
returns when something is misbehaving.

## When in doubt, run the lab

`poc-09-vfs-lab` is a graded test harness covering 15 read/write/list/binary
operations. It logs every call's exact arguments and raw response. If you
are debugging a `sg.vfs` issue or porting code to a new vault build, run
the lab first and read the live progress logs — the answer is usually
sitting in test 03, 05 or 15 (path-variant comparison).

## Quick checklist before publishing a page

- [ ] No `<link rel="stylesheet">` or `<script src="…">` tags in `<head>`
- [ ] `body.loading { visibility: hidden; }` rule in inline `<style>`
- [ ] `<body class="loading">` initially
- [ ] All resources loaded via `sg.loadCss` / `sg.loadJs` in a head
      `<script>`
- [ ] `.catch()` on the load promise removes the `loading` class
- [ ] All `sg.vfs.*` calls use absolute paths derived from
      `sg.app.selfPath`, not `location.*`
- [ ] Write UI gated on `sg.app.writable`
- [ ] `readText` calls wrapped in the slash-fallback helper if you hit the
      "Failed to parse URL" error
