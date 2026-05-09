# HTML / iframe VFS Rendering — Technical Brief

**For:** Next Claude session working on the HTML/iframe preview subsystem  
**Date:** 2026-05-09  
**Branch:** `claude/explore-vault-ui-91AQ7`  
**Scope:** Vault UI — HTML file rendering in `send-browse` and `vault-browse-edit`

---

## 1. What This System Does

The vault can display HTML files in a sandboxed iframe. Unlike a normal web server where relative asset paths (`./app.js`, `../shared/style.css`) resolve naturally, our iframe is loaded from a **Blob URL** (`blob:http://localhost/...`). Blob URLs have no base URL, so relative paths fail with 404.

The VFS (Virtual File System) rendering system solves this in two complementary ways:

1. **Static inlining** — Before the blob is created, replace `<script src="...">` and `<link rel="stylesheet" href="...">` tags with inline `<script>...code...</script>` and `<style>...css...</style>` blocks containing the file content fetched from the vault's `dataSource`.

2. **Runtime fetch interception** — Inject a `<script>` block into the HTML's `<head>` that overrides `window.fetch()` and `HTMLImageElement.prototype.src`. Intercepted requests are forwarded to the parent window via `postMessage`. The parent reads the file bytes from `dataSource` and posts them back as a Blob URL or ArrayBuffer, which the iframe uses as the resolved resource.

Both techniques are needed. Static inlining handles resources declared in HTML tags (which the browser loads natively, bypassing any JS override). The runtime fetch bridge handles resources requested dynamically at runtime by the app's own JavaScript (`fetch('/data/scores.json')`).

---

## 2. Key Files

| File | Role |
|---|---|
| `sgraph_ai_app_send__ui__user/v0/v0.3/v0.3.2/_common/js/components/send-download/send-browse--v0.3.2.js` | Core file renderer. Contains `_loadHtmlIntoIframe`, `_inlineHtmlAssets`, `_replaceAsync`, `_SG_VFS_BRIDGE_SCRIPT`, `_SG_VFS_MIME`. |
| `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.2/_common/js/components/vault-browse-edit/vault-browse-edit.js` | Vault overlay that patches `_renderFileContent`. Adds Edit/Save/Cancel controls and the split-view HTML editor. Calls `_loadHtmlIntoIframe` for the edit preview iframe. |
| `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.2/index.html` | App shell. Contains `_applyAppJson` — handles `app.json` auto-App-Mode activation. |
| `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.2/_common/js/components/sg-app-banner/sg-app-banner.js` | Fixed-position App Mode banner. Hides vault chrome and "lifts" the iframe to fill the viewport. |

---

## 3. The Complete Pipeline — `_loadHtmlIntoIframe`

This is the single authoritative function for rendering an HTML file into an iframe. Both the main viewer and the edit-mode split-view preview call it.

```
function _loadHtmlIntoIframe(iframeEl, html, fileName, dataSource, objectUrlsArr, bridgesArr)
```

**Parameters:**
- `iframeEl` — the `<iframe>` element to load into
- `html` — raw HTML string
- `fileName` — vault path of the HTML file (e.g. `apps/hub/hub.html`), used to resolve relative asset paths
- `dataSource` — the `SendBrowse` component's `dataSource` (has `.getFileList()` and `.getFileBytes(path)`). Pass `null` for a plain blob with no VFS.
- `objectUrlsArr` — optional array to push Blob URLs into for later cleanup via `URL.revokeObjectURL`
- `bridgesArr` — optional array to push `message` event listeners into for later cleanup via `window.removeEventListener`

**Steps inside `_loadHtmlIntoIframe`:**

1. Derive `htmlDir` from `fileName` — everything before the final `/`. This is the base directory for resolving relative paths.

2. Inject the VFS bridge script into `<head>`:
   ```javascript
   html.replace(/(<head[^>]*>)/i, function(m) { return m + _SG_VFS_BRIDGE_SCRIPT; })
   ```
   If no `<head>` tag exists, prepend the bridge script. This must use a **function replacer**, not string concatenation — see Bug §5.2.

3. **Async asset inlining** — call `_inlineHtmlAssets(html, htmlDir, dataSource)`. This replaces `<link rel="stylesheet" href="local.css">` and `<script src="local.js"></script>` with inline equivalents. See §4.

4. Create blob: `new Blob([inlined], { type: 'text/html' })` → `URL.createObjectURL(blob)`. Push blob URL into `objectUrlsArr`.

5. Set `iframeEl.src = blobUrl`.

6. Set up the **parent-side VFS message handler** — the counterpart to the in-iframe `window.fetch` override. Listens for `{ __sgVfsReq, url }` messages from the iframe, resolves the path, fetches bytes from `dataSource`, posts back `{ __sgVfsReply, buf, mime }`. Pushes the listener into `bridgesArr` for cleanup.

**Iframe sandbox attribute:** `sandbox="allow-scripts"`. No `allow-same-origin` — this is intentional. It prevents the iframe from escaping sandbox restrictions. It also means `localStorage`, `IndexedDB`, and `document.cookie` inside the iframe are all unavailable.

---

## 4. Asset Inlining — `_inlineHtmlAssets`

```
async function _inlineHtmlAssets(html, htmlDir, dataSource)
```

Uses `_replaceAsync` (see §4.1) to apply two async regex replacements:

**Step 1 — Inline stylesheets:**
```
/<link\b([^>]*)>/gi
```
- Check `rel="stylesheet"` attribute present
- Extract `href` attribute
- Skip external URLs (`http:`, `https:`, `//`, `data:`, `blob:`)
- Resolve path: `_resolvePath(htmlDir, href)`
- Find in file list: `_findEntry(fileList, resolvedPath)` (fuzzy prefix match)
- Fetch bytes, decode as UTF-8
- **Escape `</style`** sequences in the CSS: `css.replace(/<\/style/gi, '<\\/style')`
- Replace `<link>` tag with `<style>css</style>`

**Step 2 — Inline scripts:**
```
/<script\b([^>]*)><\/script>/gi
```
- Only matches `<script src="..."></script>` with empty body (no inline content)
- Extract `src` attribute
- Skip external URLs
- Resolve and find in file list
- Fetch bytes, decode as UTF-8
- **Escape `</script`** sequences in the JS: `code.replace(/<\/script/gi, '<\\/script')`
- Replace with `<script>code</script>`

**Why escaping is essential:** The HTML parser terminates a `<script>` or `<style>` block at the first occurrence of `</script` or `</style` respectively, even inside string literals or comments. Without escaping, any JS file containing `document.write('</script>')` or a comment mentioning `</script>` will cause the remaining source to appear as raw text in the page body. The escaped form `<\/script` is valid JavaScript (the backslash is ignored by the JS parser) and is invisible to the HTML parser.

### 4.1 `_replaceAsync`

`String.prototype.replace` is synchronous. To replace regex matches with async results:

```javascript
async function _replaceAsync(str, regex, fn) {
    var matches = [];
    str.replace(regex, function() { matches.push(Array.from(arguments)); return ''; });
    var results = await Promise.all(matches.map(function(m) { return fn.apply(null, m); }));
    var i = 0;
    return str.replace(regex, function() { return results[i++]; });
}
```

This runs two passes over the string: first to collect all matches and fire async requests in parallel, then to substitute results in order.

---

## 5. The VFS Bridge Script (`_SG_VFS_BRIDGE_SCRIPT`)

This is a `<script>` block injected into the HTML's `<head>` before blob creation. It runs inside the iframe at page load time.

**What it overrides:**

1. **`window.fetch()`** — checks if the URL is relative (no protocol). If so, posts `{ __sgVfsReq: uuid, url }` to `window.parent` and returns a Promise that resolves when the parent replies with `{ __sgVfsReply: uuid, buf, mime }`. Constructs a `Response`-like object from the ArrayBuffer.

2. **`HTMLImageElement.prototype.src` setter** — same interception for `<img src="relative.png">` set via JavaScript. Posts to parent, receives blob URL reply, sets the real `src`.

3. **`MutationObserver`** — watches for new `<img>` elements being inserted with relative `src` attributes (handles `setAttribute` calls that bypass the property setter).

**What it does NOT intercept:**

- `<script src="...">` in HTML — browser-native resource loading, happens before JS runs
- `<link href="...">` in HTML — same
- `<img src="...">` set in HTML (static attribute, loaded natively before JS runs)
- CSS `url(...)` in `<style>` blocks — loaded natively by CSS parser
- CSS `url(...)` in inline `style` attributes — loaded natively
- `<audio src>`, `<video src>`, `<source src>` — loaded natively

This is why asset inlining (§4) is also needed — the fetch override alone is insufficient for HTML-declared resources.

---

## 6. Bugs Encountered and How They Were Fixed

### 6.1 VFS bridge script visible as page body text

**Symptom:** The text content of `sitenav.js` (a relative `<script src>`) appeared as raw text in the rendered page.

**Root cause:** The app fetched `sitenav.js` via `fetch()` at runtime and tried to inject it into the DOM. But `sitenav.js` was declared as `<script src="app/sitenav.js">` — a static HTML script tag that the browser had already tried to load natively (and failed, because the blob URL has no base). The app was apparently trying to recover from the failure by fetching it separately. Because the `window.fetch` override was in place but the file resolution was off, the content ended up as text.

**Fix:** Asset inlining (§4). `sitenav.js` is now inlined into the blob before creation. The browser never needs to make a network request for it.

### 6.2 `$1` backreference corrupting VFS bridge injection

**Symptom:** The injected VFS bridge script appeared mangled in the blob HTML — certain sequences were replaced with regex capture group content.

**Root cause:**
```javascript
// WRONG:
html.replace(/(<head[^>]*>)/i, '$1' + vfsBridgeScript)
```
`String.prototype.replace` interprets `$1`, `$2`, `$&`, `$'`, `` $` `` in the replacement string as special patterns. The VFS bridge script contained `$1` inside a JavaScript string literal, which was expanded to the `<head>` tag content — corrupting the script.

**Fix:**
```javascript
// CORRECT:
html.replace(/(<head[^>]*>)/i, function(m) { return m + vfsBridgeScript; })
```
A function replacer receives the matched string and capture groups as arguments and returns the replacement string. No pattern substitution is performed on the return value.

### 6.3 `</script>` in inlined JS terminating the script block

**Symptom:** After inlining a JS file, everything after the first `</script` in that file appeared as raw HTML text in the page. In one case this produced a stray `>` character at the top of the rendered page (the `>` that followed `</script`).

**Root cause:** The HTML parser terminates `<script>` at `</script` regardless of context. A JS file containing (for example):
```javascript
// Handles </script> tags in template strings
```
will cause the HTML parser to close the `<script>` element at that point.

**Fix:** Before inlining, escape all occurrences:
```javascript
code = code.replace(/<\/script/gi, '<\\/script');
```
`<\/script` is valid JavaScript (the backslash is a no-op) but the HTML parser does not recognise it as a closing tag.

### 6.4 `</style>` in inlined CSS terminating the style block

**Symptom:** Same class of bug as 6.3 but for CSS. CSS child combinator `>` in a selector after a `</style>` comment would prematurely close the `<style>` block.

**Fix:**
```javascript
css = css.replace(/<\/style/gi, '<\\/style');
```

### 6.5 Edit preview iframe blank

**Symptom:** The split-view editor (HTML source on left, preview on right) showed an empty iframe.

**Root cause:** The initial preview implementation created a plain blob URL with no VFS bridge and no asset inlining:
```javascript
pvFrame.src = URL.createObjectURL(new Blob([rawText], { type: 'text/html' }));
```
This could not load any relative assets, so multi-file HTML apps appeared blank or broken.

**Fix:** Preview now calls `_loadHtmlIntoIframe` — identical to the main viewer:
```javascript
_loadHtmlIntoIframe(pvFrame, _htmlTextarea.value, fileName, self.dataSource, null, _pvBridges);
```

### 6.6 `_pvBridges is not defined` ReferenceError

**Symptom:** Console error `ReferenceError: _pvBridges is not defined` when clicking the Cancel button in HTML edit mode.

**Root cause:** JavaScript `var` has function scope, not block scope. `var _pvBridges = []` was declared inside the Edit button's click handler. The Cancel button's click handler is a sibling function — it can only see variables from scopes that enclose both handlers, not from the Edit handler's scope.

**Fix:** Move `_pvBridges` (and the other HTML-edit state variables) to the shared outer scope — the `_renderFileContent` patch's closure — where all three handlers (Edit, Save, Cancel) can access them:

```javascript
var _htmlTextarea  = null;
var _htmlSplitEl   = null;
var _htmlPrevTimer = null;
var _htmlEditing   = false;
var _pvBridges     = [];   // ← shared by all three handlers
```

### 6.7 VFS bridge listeners accumulating per preview update

**Symptom:** After the user typed in the HTML editor and the preview updated multiple times, the parent window had N active `message` event listeners (one per update). Each update fired all N listeners, causing N fetch responses per asset request.

**Root cause:** Each call to `_updatePv()` added a new `window.addEventListener('message', vfsBridge)` without removing the previous one.

**Fix:** Before each update, remove all previous listeners:
```javascript
function _updatePv() {
    _pvBridges.forEach(function(b) { window.removeEventListener('message', b); });
    _pvBridges = [];
    _loadHtmlIntoIframe(pvFrame, _htmlTextarea.value, fileName, self.dataSource, null, _pvBridges);
}
```
`_loadHtmlIntoIframe` pushes the new listener into `_pvBridges` as it sets up the bridge.

### 6.8 `app.json` click triggering wrong App Mode state

**Symptom:** Clicking `app.json` in the vault file tree caused the raw JSON to appear in an incorrect UI state — App Mode was activating even though `app.json` is not an HTML app.

**Root cause 1:** `_applyAppJson` activated App Mode unconditionally when `"present": true`, without checking whether the entry file actually existed in the vault.

**Root cause 2:** `_waitForIframeAndLift` watches for any `.sb-file__content` to appear in the DOM. When the user opened `app.json`, its code view created a `.sb-file__content` element — App Mode lifted that instead of an HTML iframe.

**Fix 1 (`index.html`):** Add entry file existence check before activating:
```javascript
var entryExists = fileList.some(function(e) {
    return !e.dir && (e.path === entryFile || e.path.endsWith('/' + entryFile));
});
if (appMode && entryExists && !window._sgAppModeUserExited) {
    var banner = document.querySelector('sg-app-banner');
    if (banner) banner.activate();
}
```

**Fix 2 (`vault-browse-edit.js`):** Only re-lift in App Mode for HTML file types:
```javascript
if (_banner && _banner.style.display !== 'none' && typeof _banner.activate === 'function'
        && (_ext0 === 'html' || _ext0 === 'htm')) {
    _banner.activate(_newContentEl);
}
```

---

## 7. What Was Tried and Rejected

### Service Worker for asset interception
A Service Worker can intercept all network requests including native browser loads. This would solve the `<script src>` problem without inlining.

**Rejected because:**
- Service Workers require HTTPS or localhost (fine in prod, awkward in some dev setups)
- Registration is async; there's a race on first page load before SW is active
- SW scope must cover the blob URL origin — complex to configure
- Adds significant complexity for a feature that inlining handles adequately

### `srcdoc` attribute instead of Blob URL
Setting `iframe.srcdoc = html` loads the HTML string directly without creating a Blob URL. The iframe still has no base URL, so relative paths still fail.

**Rejected because:** Same problem as blob URLs — relative asset resolution still fails. Would still need asset inlining. Gains nothing over the current approach.

### `allow-same-origin` sandbox flag
Adding `allow-same-origin` to the iframe's `sandbox` attribute would let relative paths resolve against the parent page origin.

**Rejected because:** Completely removes the sandbox's same-origin isolation. The iframe could then access the parent's DOM, localStorage, cookies, and vault data. Security regression — not acceptable.

### `base` tag injection
Injecting `<base href="https://actual-vault-origin/path/to/html-dir/">` would make relative URLs resolve correctly via the browser's native URL resolution.

**Rejected because:** Requires the vault origin to serve the asset files, which would require the parent page to proxy requests for the iframe — essentially rebuilding the VFS bridge at the network layer. Also exposes the vault path structure in URLs. Not simpler than the current approach.

---

## 8. Known Remaining Issues

### Color / rendering differences between main viewer and edit preview

The user reported that colors look different between the main HTML viewer and the edit-mode split preview. Both call `_loadHtmlIntoIframe` with identical arguments, so the HTML content is identical. Likely causes:

1. **Split-view layout constraints** — the preview iframe is inside a flex container that shares horizontal space with the textarea. CSS `min-width`, `max-width`, or `overflow` constraints might affect media queries or viewport-relative units inside the iframe.

2. **Iframe `width` / `height`** — the main viewer sets `flex:1; border:none; width:100%; height:100%; min-height:0` (applied by `_liftContentFrame` in App Mode). The edit preview iframe may have different dimensions, triggering different responsive breakpoints.

3. **`sandbox` attribute differences** — if there are any differences in sandbox flags between the two iframes.

To investigate: inspect the two iframes' computed dimensions and sandbox attributes. Add `width: 100%; height: 100%;` explicitly to the preview iframe and check whether the difference persists.

### CSS `url(...)` in stylesheets

After asset inlining, an inlined stylesheet may contain `url('./images/bg.png')` references. These are resolved by the CSS parser relative to the blob URL (no base), so they fail silently.

To fix: add a post-inlining pass over inlined CSS to replace relative `url(...)` references with base64 data URIs or blob URLs. This is similar to the `_inlineHtmlAssets` approach but applied recursively to CSS content.

### CSS `@import` in stylesheets

Same problem — `@import './reset.css'` in an inlined stylesheet will fail. Fix is the same: resolve and inline recursively during `_inlineHtmlAssets`.

### `<audio>`, `<video>`, `<source>` native loading

These use the browser's native media loader and bypass `window.fetch()`. No fix implemented. For typical apps in the vault this is unlikely to matter, but it's a gap.

---

## 9. Current Code State (as of commit b50d822)

**`send-browse--v0.3.2.js` — module-level additions:**

- `_SG_VFS_BRIDGE_SCRIPT` — the full bridge `<script>` string to inject into `<head>`
- `_SG_VFS_MIME` — extension → MIME type map
- `_replaceAsync(str, regex, fn)` — async-capable regex replacer
- `_inlineHtmlAssets(html, htmlDir, dataSource)` — inlines `<link>` and `<script src>` tags
- `_loadHtmlIntoIframe(iframeEl, html, fileName, dataSource, objectUrlsArr, bridgesArr)` — full pipeline

**Main viewer (BRW-013 block in `_renderFileContent`):**
```javascript
var iframeEl = document.createElement('iframe');
iframeEl.className = 'sb-file__html-frame';
iframeEl.sandbox   = 'allow-scripts';
iframeEl.style.flex = '1';
content.appendChild(iframeEl);
if (!self._vfsBridges) self._vfsBridges = [];
_loadHtmlIntoIframe(iframeEl, rawText, fileName, self.dataSource, self._objectUrls, self._vfsBridges);
```

**Edit preview (in `vault-browse-edit.js`):**
```javascript
var _pvBridges = [];  // shared scope — accessible by Edit, Cancel, Save handlers

function _updatePv() {
    _pvBridges.forEach(function(b) { window.removeEventListener('message', b); });
    _pvBridges = [];
    if (typeof _loadHtmlIntoIframe === 'function') {
        _loadHtmlIntoIframe(pvFrame, _htmlTextarea.value, fileName, self.dataSource, null, _pvBridges);
    } else {
        pvFrame.src = URL.createObjectURL(new Blob([_htmlTextarea.value], { type: 'text/html' }));
    }
}
```

---

## 10. Orientation for the Next Session

1. **Read `send-browse--v0.3.2.js`** — search for `_SG_VFS_BRIDGE_SCRIPT`, `_inlineHtmlAssets`, and `_loadHtmlIntoIframe`. These are the three module-level anchors.

2. **Read `vault-browse-edit.js`** — search for `_ext0 === 'html'` to find the HTML-specific edit mode block. The `_pvBridges` variable and `_updatePv` function live there.

3. **To test changes:** The vault UI lives at `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.2/`. The user workflow UI (which contains `send-browse`) lives at `sgraph_ai_app_send__ui__user/v0/v0.3/v0.3.2/`. Both must be served; the vault shell embeds the send-browse component.

4. **To trigger the HTML viewer:** Open a writable vault, navigate to an HTML file. The Edit button appears only when a writable vault token is active. In read-only mode, the file renders directly with no edit controls.

5. **CSS `url(...)` in inlined stylesheets** is the most impactful remaining gap — images loaded via CSS background properties won't work.

6. **The `$1` pattern bug** (§6.2) is subtle and will re-emerge if anyone modifies the bridge injection line to use string concatenation. The function replacer pattern is the correct and permanent fix.
