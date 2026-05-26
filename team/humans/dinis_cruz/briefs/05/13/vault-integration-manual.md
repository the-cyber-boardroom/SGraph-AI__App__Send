# SG/Vault Integration — Field Manual for LLM Agents

> A practical guide for LLMs building HTML pages that live inside an SG/Vault encrypted vault. Every rule here was learned by breaking something. Read it before you write your first vault HTML file.

---

## What the vault actually is

An SG/Vault is a zero-knowledge encrypted object store with git-like versioning. Files live in the user's browser or a `sgit` clone, never on a server in plaintext. When the user opens a vault and clicks "App Mode" on an HTML file (or `app.json` points at one), that HTML loads inside a **blob: iframe** with the `sg` bridge injected — a global `sg` object that lets your page read/write vault files, load CSS/JS from the vault, and inspect its own location.

This iframe is not a normal browser environment. Half of what you'd reach for by reflex doesn't work. The other half works but with quirks the docs don't always mention. This manual is the difference between a working vault app and three hours of debugging.

---

## The two contexts every file lives in

Every HTML file in the vault renders in two completely different environments, and your code must handle both:

**App Mode** — the user is running the file as an app. `sg` is defined. `sg.vfs` works. `sg.loadCss` / `sg.loadJs` work. This is where the page actually runs.

**File Preview** — the user clicked the file in the vault's file tree. The vault renders it in a sandboxed iframe **without** `sg`, **without** `localStorage`, **without** any vault APIs. Just static HTML/CSS/JS. If your page assumes `sg` exists, it throws on the first line and the user sees a blank screen.

Always guard:

```javascript
if (typeof sg !== 'undefined') {
  // App Mode — use sg.vfs, sg.loadJs, etc.
} else {
  // File Preview — show static fallback, reveal body
  document.body.style.display = 'block';
}
```

---

## Resource loading: the FOUC pattern

### The rule

**Never use declarative `<link rel="stylesheet">` or `<script src="...">` with vault-relative paths.** The HTML parser fires these before the `sg` bridge installs them in the iframe, and they 404 silently. You'll see no error, just a blank page or unstyled content.

Always load CSS and JS via `sg.loadCss()` and `sg.loadJs()`.

### The canonical pattern

```html
<!DOCTYPE html>
<html>
<head>
<title>My Vault App</title>
<style>
  /* Hide body until resources load — prevents FOUC */
  body { display: none; }
</style>
<script>
  if (typeof sg !== 'undefined') {
    Promise.all([
      sg.loadCss('app.css'),
      sg.loadJs('app.js'),
      sg.loadJs('score.js'),
    ]).then(() => {
      document.body.style.display = 'block';
    }).catch(err => {
      console.error('[my-app] Resource load failed:', err);
      document.body.style.display = 'block';
    });
  } else {
    // File preview context — sg not available, show body as-is
    document.body.style.display = 'block';
  }
</script>
</head>
<body>
  <!-- your app content -->
</body>
</html>
```

### Two non-obvious gotchas in this pattern

**1. `document.body.style.display = ''` does NOT restore the body.**

You'd expect `style.display = ''` to clear the inline style and fall back to the stylesheet default (which would be `block`). It doesn't. The `body { display: none }` rule is inside the same document's `<style>` tag, and `style.display = ''` only removes the *inline* override — the document-level rule still wins, body stays hidden. **Always use `document.body.style.display = 'block'`** explicitly.

**2. `DOMContentLoaded` inside a file loaded via `sg.loadJs` is a no-op.**

The event fires during HTML parsing, long before `sg.loadJs` resolves. By the time your script attaches the listener, `DOMContentLoaded` has already fired. The handler never runs. Use the `.then()` callback after `Promise.all([sg.loadCss, sg.loadJs])` as your init hook instead — the DOM is ready by then.

```javascript
// ❌ Never works in sg.loadJs'd files
document.addEventListener('DOMContentLoaded', init);

// ✅ Use the .then() callback after Promise.all instead
Promise.all([sg.loadCss('app.css'), sg.loadJs('app.js')])
  .then(() => init());
```

---

## Reading files from the vault: `sg.vfs`

### Path derivation: never trust `location.href`

`location.href` inside the vault iframe returns the blob URL — something like `blob:http://localhost:10067/60a40bb8-3e67-44fa-a62a-bc2d5490eccd`. It has nothing to do with where your file actually lives in the vault. **It is useless for path derivation.**

The only reliable source is `sg.app.selfPath`, which returns the vault-relative path of the currently-loaded HTML file (e.g. `'shared/test-lab/index.html'`). Derive everything from there:

```javascript
function deriveBase() {
  const dir = sg.app.selfPath.replace(/[^/]*$/, ''); // 'shared/test-lab/'
  return '/' + dir.replace(/^\//, '');               // '/shared/test-lab/'
}
```

### Reading text/JSON with the safe pattern

`sg.vfs.readText(path)` may reject a leading slash on some builds and require it on others. Always wrap with both variants:

```javascript
async function safeReadText(path) {
  try {
    return await sg.vfs.readText(path);
  } catch(e1) {
    try {
      return await sg.vfs.readText(path.replace(/^\//, ''));
    } catch(e2) {
      throw new Error('readText failed both variants: ' + e2.message);
    }
  }
}

async function safeReadJson(path) {
  // For files that may be accessed both in vault and via fetch fallback
  if (typeof sg !== 'undefined' && sg.vfs && sg.vfs.readText) {
    try { return JSON.parse(await safeReadText(path)); }
    catch(e) { /* fall through */ }
  }
  const r = await fetch(path);
  if (!r.ok) throw new Error('fetch ' + r.status);
  return r.json();
}
```

### Listing a directory

`sg.vfs.list(path)` returns an array but **includes the directory itself as the first entry** with `type: 'folder'`. Filter it:

```javascript
const entries = await sg.vfs.list(path);
const children = entries.filter(e => !(e.type === 'folder' && e.path === path));
```

### Writing files: `sg.vfs.write`

`sg.vfs.write(path, content)` takes **~4 seconds per call** in the current build. This is expected, not a bug. Plan UI loading states accordingly — a "Save" button that just disables for 4 seconds is fine; a progress spinner is friendlier.

**Encoding gotcha:** writes can fail with "Bad encoding" if the content contains emoji or non-BMP Unicode characters. Sanitize before writing:

```javascript
function sanitize(text) {
  // Strip non-BMP characters (emoji, etc.) before write
  return text.replace(/[\u{10000}-\u{10FFFF}]/gu, '');
}

await sg.vfs.write(path, sanitize(content));
```

### Read-only sessions and VFS index gotcha

In read-only sessions (when the user opens a vault with a read-only key), the VFS file index is built **at session start** and doesn't refresh. If you push new files to the vault after the user opened it, those new files won't appear in `sg.vfs.list()` and `sg.vfs.readText()` will fail on them — even though they exist in the vault. The user must close and reopen the vault to pick them up.

This bit us hard with Chart.js: we pushed `shared/vendor/chart.umd.js` mid-session, and `sg.loadJs('shared/vendor/chart.umd.js')` returned 404 even though `sgit pull` showed the file was there. **Workaround:** inline large vendor libraries directly into the HTML file (`<script>` block) rather than loading them from a subdirectory the read-only session won't know about.

---

## The sandboxed-iframe trap: no localStorage in File Preview

When the user opens a file from the vault file tree (preview mode), it renders in an iframe with the `sandbox` attribute set **without** `allow-same-origin`. This blocks `localStorage`, `sessionStorage`, and cross-frame `eval` entirely. Any access throws:

```
Uncaught SecurityError: Failed to read the 'localStorage' property from 'Window':
The document is sandboxed and lacks the 'allow-same-origin' flag.
```

This means **you cannot use `localStorage` to pass state between pages.** It works in App Mode but throws in the file preview, and users will land on broken pages.

### The pattern that doesn't work

Don't do this:

```html
<!-- ❌ Page A: set state, navigate -->
<a href="page-b.html" onclick="localStorage.setItem('profile', 'alex')">Open</a>
```

```javascript
// ❌ Page B: read state on load
const profile = localStorage.getItem('profile'); // throws in preview
```

### The pattern that does work

Bake the state into separate files. If you need to land on `review.html` with `profile=alex` set, create a `review-alex.html` that hardcodes it:

```html
<!-- review-alex.html: full copy of review.html with profileKey hardcoded -->
<script>
  const profileKey = 'alex';  // hardcoded
  // ... rest of the logic
</script>
```

```javascript
// When generating these copies from a single source:
const src = await readFile('review.html');
for (const profile of ['alex', 'sam']) {
  const patched = src.replace(
    /const profileKey = .*?;/,
    `const profileKey = '${profile}';`
  );
  await writeFile(`review-${profile}.html`, patched);
}
```

If you must use `localStorage` for App Mode where it does work, always wrap it:

```javascript
let stored = null;
try { stored = localStorage.getItem('myKey'); } catch(e) {}
const value = stored || defaultValue;
```

---

## Cross-page navigation: `window.location.href` is dead

Inside the vault blob iframe, `window.location.href = 'somefile.html'` does **not** navigate the iframe to a new vault file. The URL changes but nothing loads. The page sits there indefinitely on whatever HTML it had.

This kills the "thin redirect page" pattern:

```html
<!-- ❌ Doesn't work — page hangs forever -->
<script>
  localStorage.setItem('profile', 'alex');
  window.location.href = 'review.html';
</script>
```

**Always make each entry-point file self-sufficient.** If you need three variants of a page, generate three files, don't redirect:

```bash
# Build script: generate variants from a single source
for profile in alex sam; do
  sed "s/PROFILE_PLACEHOLDER/$profile/" review.template.html > "review-${profile}.html"
done
```

---

## Caching: refresh after push

After `sgit push`, the vault UI keeps the **old** version of the file cached. The user sees stale content until they click the "🔄 Refresh" button in the vault UI's topbar. In read-only sessions the cache is especially sticky.

For your debugging workflow this means: every push needs a manual refresh on the user's side before testing changes. If something "isn't working" after a push, first verify the user actually refreshed. Pull and `cat` the file from your end to confirm the push actually contains your changes.

---

## Playwright automation gotchas

If you're driving the vault UI via Playwright (e.g. for screenshots or end-to-end testing):

**You cannot evaluate JS inside the blob: iframe.** The `sandbox` attribute blocks cross-frame `eval`. Playwright can only:
- Navigate the outer page (`page.goto(...)`)
- Take screenshots
- Dispatch DOM events on the outer page (clicking the file tree, App Mode button, etc.)
- Capture console messages via `page.on('console', ...)` — this is your only window into what's happening inside the iframe

```python
# ✅ Capture iframe console output
page.on('console', lambda msg: print('[iframe]', msg.text))

# ✅ Click files in the vault tree (outer page)
await page.evaluate("""() => {
  const el = [...document.querySelectorAll('.sb-tree__file-name')]
    .find(e => e.textContent.trim() === 'app.html');
  if (el) el.dispatchEvent(new MouseEvent('click', {bubbles:true}));
}""")

# ❌ Doesn't work — can't reach inside the iframe
await page.frames[1].evaluate("() => sg.vfs.list('/')")
```

For tests that need to inspect what's actually happening in vault code, build a **test harness inside the vault itself** — an HTML page with buttons that run tests, render results to the DOM, and optionally write a report file via `sg.vfs.write`. The user (or your agent on the next session) runs the tests in App Mode, saves a JSON report to the vault, then you `sgit pull` and read the report.

---

## File organisation

### `app.json` — the App Mode entry point

A JSON file at the vault root that tells the vault which HTML file to open when the user clicks "App Mode":

```json
{
  "entry": "home/index.html",
  "auto_open": false,
  "present": false
}
```

- `entry` — vault-relative path to the HTML file
- `auto_open` — if `true`, the file opens automatically when the vault is decrypted
- `present` — presentation mode (hides UI chrome)

### Folder structure that works well

```
your-vault/
├── app.json
├── _page.json              # Optional: structured page for vault "doc viewer" mode
├── .vault-settings.json    # Vault metadata (don't edit unless you know why)
├── home/                   # Putting files in a named folder avoids "undefined"
│   └── index.html          # in the vault UI's file preview header
├── shared/
│   ├── data.json
│   ├── styles.css
│   └── lib.js
└── pages/
    ├── view-a.html
    └── view-b.html
```

**Why `home/index.html` not `home.html`:** the vault file preview shows `{folder}/{filename}` in its header. Root-level files get `undefined/{filename}` because the folder is missing. Cosmetic but visible.

---

## Sgit commands you'll actually use

Working with a local clone of the vault:

```bash
# Clone
sgit clone <vault-key>:<vault-id> ~/path/to/clone

# Pull latest before editing
sgit pull

# Commit changes
sgit commit "Descriptive message"

# Push (requires write token for write-enabled vaults)
sgit --token <write-token> push

# Inspect
sgit history log              # recent commits
sgit file cat path/to/file    # read a file
sgit file ls path/to/dir      # list a directory
sgit status                   # uncommitted changes
```

A complete edit-test-commit cycle:

```bash
cd ~/my-vault-clone
sgit pull                                                 # always pull first
# ... edit files ...
node --check patient/app/app.js                           # syntax check JS
sgit commit "Fix X and Y"
sgit --token graphs-and-maps push                         # push to remote
# tell the user to hit Refresh in the vault UI
```

---

## What you can borrow from `sg`

The full surface you'll see logged on app start:

```
window.sg ready | writable=true | vaultName=My Vault |
loaders: sg.loadCss, sg.loadJs | sg.sync, sg.git (deprecated), sg.auth, sg.ui
```

Methods worth knowing:

| API | Purpose |
|---|---|
| `sg.app.selfPath` | Vault-relative path of the current file. The only reliable path source. |
| `sg.app.writable` | Boolean — is this a write-enabled session? Check before showing edit UI. |
| `sg.loadCss(path)` | Async load a CSS file from a vault-relative path. |
| `sg.loadJs(path)` | Async load a JS file. Returns a promise that resolves when the script has executed. |
| `sg.vfs.readText(path)` | Read a file as text. Wrap with `safeReadText` for slash variants. |
| `sg.vfs.write(path, content)` | Write a file. ~4s latency. Sanitize content. |
| `sg.vfs.list(path)` | List a directory. Filter out the directory's own entry. |

Avoid `sg.git` — it's deprecated.

---

## A debugging checklist when things break

1. **Blank page** → Is `body { display: none }` set without a working reveal path? Did you forget `display = 'block'`?
2. **404 on CSS/JS** → Are you using declarative `<link>` or `<script src>` instead of `sg.loadCss`/`sg.loadJs`?
3. **404 on a file you know exists** → Read-only session and the file was added after session start. User must reopen the vault.
4. **`localStorage` SecurityError** → File preview iframe blocks it. Wrap in try/catch or restructure to not need cross-page state.
5. **Page hangs on "Loading..."** → Probably `window.location.href` to a redirect page. Make the page self-sufficient instead.
6. **"Bad encoding" on write** → Strip emoji and non-BMP Unicode from content before `sg.vfs.write`.
7. **Old version of file after push** → User needs to hit "🔄 Refresh" in the vault UI topbar.
8. **DOMContentLoaded handler never fires** → File was loaded via `sg.loadJs` after the event already fired. Use the `Promise.all().then()` callback as your init hook.
9. **`undefined` shown above file preview** → File is at vault root. Move it into a named folder so the preview shows `folder/filename` instead of `undefined/filename`.

---

## The minimal vault HTML template

When in doubt, start from this:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Vault Page</title>
<style>
  body { display: none; }
  /* ...your styles or load via sg.loadCss... */
</style>
<script>
  if (typeof sg !== 'undefined') {
    Promise.all([
      sg.loadCss('styles.css'),
      sg.loadJs('app.js'),
    ]).then(() => {
      document.body.style.display = 'block';
      if (typeof init === 'function') init();
    }).catch(err => {
      console.error('[my-page] Resource load failed:', err);
      document.body.style.display = 'block';
    });
  } else {
    // File preview — sg not available
    document.body.style.display = 'block';
  }
</script>
</head>
<body>
  <h1>My Vault Page</h1>
  <!-- content -->
</body>
</html>
```

Internalise this template, the FOUC rules, the path derivation pattern, and the localStorage warning. Everything else is just careful application of these primitives.

---

## A closing principle

The vault iframe is a hostile environment for assumptions. Things that "just work" in a normal browser will fail silently here. The good news: every failure mode is reproducible, every workaround is mechanical, and once you've internalised the patterns above, building vault apps is just like building any other static site — except the user owns the encryption keys and the data never leaves their device.

Write defensive code. Always have a fallback for when `sg` isn't there. Test in both App Mode and File Preview before declaring something done. Build a test harness inside the vault if you need to debug anything iframe-internal. Pull before you edit, push when you're done, and tell the user to refresh.
