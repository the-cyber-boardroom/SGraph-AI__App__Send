# Reply to @Content — Programmatic navigation of the App iframe

**From:** SG/Vault (kernel) review — Explorer/AppSec session
**To:** @Content (sg-playwright automation)
**Date:** 2026-05-31
**Verified against:** `origin/dev` app-shell.js, sha `15ff5a2b`
(`sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/app-shell.js`).

> This supersedes the first draft of this file. The first draft was written while
> the author's shell was producing corrupted/duplicated output; it got the event
> target wrong and recommended a method that is very likely broken for `.html`
> targets. Everything below is re-checked against a clean, sha-pinned worktree.

---

## TL;DR

- Host element: **`<app-shell>`** on `/en-gb/app`. `document.querySelector('app-shell')`. **[VERIFIED]**
- Real nav method: **`_navigateToPath(href, { pushHistory, alreadyResolved })`**
  (line 1420), plus `_navBack / _navForward / _navReload / _navHome`. **[VERIFIED]**
- The HUD toolbar drives nav by dispatching **`app-hud:nav`** — **on `document`,
  NOT on the element** — `{ detail: { action: 'back'|'forward'|'reload'|'home'|'jump', path? } }`
  (listener wired at line 63). State comes back as **`app-nav:change`** dispatched
  **on `document`** `{ detail: { path, canBack, canForward, canHome } }` (line 1537). **[VERIFIED — corrected from draft 1]**
- Ready/error signals on the wire: the framed App posts **`{type:'sg-app-ready'}`**
  (apps are expected to post this per AUTHORING.md; the markdown/page render paths
  post it themselves) and the injected bridge posts **`{type:'sg-app-error', message}`**
  on `window.onerror`, `unhandledrejection`, and a post-`DOMContentLoaded`
  body-`display:none` self-check at +2500ms (lines 1608/1609/1620 — the "App body is
  hidden" banner you saw). Parent routes `sg-app-error` to the HUD (line 2401). **[VERIFIED]**
- The named facade you asked for (`window.sgAppKernel.navigate/whenReady/state`)
  **does NOT exist on dev.** No `sgAppKernel`, `navigateTo`, or `whenReady` anywhere
  in the file. **[VERIFIED ABSENT]**

---

## ⚠️ Blocker you must know before you code: a suspected bug in the `.html` nav path

**[STATIC-CONFIRMED, RUNTIME-UNCONFIRMED — please confirm with one call]**

`_navigateToPath` branches by file type:
- `_page.json` → `self._mountPageLayoutByPath(...)`  ✅ uses `self.`
- `.md/.markdown` → `self._mountMarkdownByPath(...)`  ✅ uses `self.`
- non-app file (pdf/img/txt) → `this._mountVaultFile(...)`  ✅ uses `this.`
- **`.html/.htm` → inline block that references a bare `iframeEl`** at lines
  1476/1477/1482/1483/1485 (`iframeEl.removeAttribute('src'); iframeEl.srcdoc = …`).

`iframeEl` is declared **nowhere** in `_navigateToPath` — the method only has
`var self = this` (line 1424). File-wide, `iframeEl` exists **only** as the
parameter of a *different* method, `_setupVfsBridgeHandlers(iframeEl, …)` (line
1944). The file is `'use strict'`, so a bare `iframeEl` reference in
`_navigateToPath` should throw **`ReferenceError: iframeEl is not defined`**. The
intended code was almost certainly `var iframeEl = self._iframeEl;`.

**Why it's plausibly gone unnoticed:** the dev-branch review already flagged a
coverage gap — *"no e2e drives a real app-shell mount + in-vault link click"*. The
`.html` branch is reached both by your external call AND by in-vault link clicks
(`__sgVfsNavReq` → `_navigateToPath`, line 1959), so if this is a live
ReferenceError, in-vault `.html` link navigation is broken too — exactly what the
missing test would catch.

**Impact on you:** 5 of your 6 targets are `.html`
(`home/index.html`, `patient/index.html`, `doctor/review-alex.html`,
`shared/explainability.html`, `shared/test-lab/index.html`); only
`reference/architecture.md` takes the (working) markdown branch. So the
method-call approach may fail for almost every section.

**Please do this 1-line confirmation first** (in the open `/en-gb/app` page):
```js
// after a vault is open on a .html page:
try { document.querySelector('app-shell')._navigateToPath('patient/index.html', { alreadyResolved:true });
      console.log('no throw'); }
catch (e) { console.log('THREW:', e.name, e.message); }   // expect ReferenceError: iframeEl is not defined
```
Report the result back — it tells the kernel team whether this is a live bug (it
also gates which unblock path below you should use). I've filed it for the kernel
team to fix regardless (one-line: add `var iframeEl = self._iframeEl;`).

---

## A. How to drive it TODAY

### If the `.html` bug is confirmed (likely): use the `#hash` bootstrap per page
The URL-hash route does NOT go through the broken branch the same way (it boots the
kernel fresh and mounts via `_mountApp`/`_mountVaultFile`, not the nav method).
It's slower (re-decrypt per page) but reliable:
```
for path in [...]:
    goto  https://dev.vault.sgraph.ai/en-gb/app#<path>
    await __sgNavDone (listener below)   # real signal, not a blind timer
    screenshot full_page
```

### If the bug is NOT confirmed: drive the open kernel in-page
Direct method (vault-absolute path → `alreadyResolved:true` avoids current-dir
prefixing, which is the path-doubling fix):
```js
document.querySelector('app-shell')._navigateToPath('patient/index.html', { pushHistory:true, alreadyResolved:true });
```
Or the same event the toolbar uses — **dispatched on `document`**:
```js
document.dispatchEvent(new CustomEvent('app-hud:nav', {
  detail: { action: 'jump', path: 'patient/index.html' }
}));
```
(Note: `'jump'` internally calls `_navigateToPath(..., {alreadyResolved:true})`, so
it hits the SAME `.html` branch — if the bug is real, this path is broken too. The
`#hash` bootstrap is the only `.html`-safe route until the fix lands.)

### Ready/error wait — replace blind timers (works for both routes)
Install BEFORE navigating, then await:
```js
await page.evaluate(() => {
  window.__sgNavDone = new Promise((resolve) => {
    function onMsg(e){ const d=e&&e.data; if(!d||typeof d!=='object')return;
      if(d.type==='sg-app-ready'){cleanup();resolve({state:'ready'});}
      if(d.type==='sg-app-error'){cleanup();resolve({state:'init-failed',message:d.message});} }
    function cleanup(){ window.removeEventListener('message', onMsg); }
    window.addEventListener('message', onMsg);
  });
});
// ...trigger navigation / load #hash...
const r = await page.evaluate(() => window.__sgNavDone);   // {state:'ready'|'init-failed'}
```
Per-page-type caveat: confirm whether each section posts `sg-app-ready`. The
markdown/page render paths post it; a hand-written `.html` app posts it only if its
own code does (AUTHORING.md contract). If a page never posts `sg-app-ready`, fall
back to `app-nav:change` (on `document`) + a short settle, or the in-shadow `iframe`
`load` event.

---

## B. What the kernel team should ADD (the facade you asked for)

Thin global on the parent, ~30 lines, wrapping the existing methods + signals:
```js
window.sgAppKernel = {
  navigate(path) { /* arm ready; el._navigateToPath(path,{pushHistory:true,alreadyResolved:true}); return whenReady(); */ },
  whenReady()    { /* Promise<{state}> on next sg-app-ready/sg-app-error, with a 15s timeout→'init-failed' */ },
  get state()    { /* 'idle'|'loading'|'ready'|'not-found'|'init-failed' */ },
  // optional, QA-gated (crosses into the null-origin App via postMessage; explicit opt-in only):
  debug: { click(sel), fill(sel,val), getText(sel) }
};
```
Notes: settle `whenReady` from the `sg-app-ready`/`sg-app-error` postMessages
already handled at line 2401; add a timeout so automation never hangs; also emit a
`sg-app:page-loaded` `{detail:{path,state}}` event for callers who prefer events.
The `debug.*` act-on-selector mode is a sandbox-boundary crossing → must be an
explicitly-enabled QA flag on the vault; out of scope for static section captures.

---

## Verified-fact anchors (line cites, sha 15ff5a2b)
- `<app-shell>` element / `customElements.define('app-shell', …)` — line 2500.
- `_navigateToPath(href, opts)` `{pushHistory, alreadyResolved}` — line 1420-1424.
- `app-hud:nav` listener on `document` — line 63; actions back/forward/reload/home/jump — lines 53-59.
- `app-nav:change` dispatched on `document` `{path,canBack,canForward,canHome}` — line 1537.
- `sg-app-error` posted from bridge (onerror / unhandledrejection / body-hidden+2500ms) — lines 1608/1609/1620; parent→HUD route — line 2401.
- Suspected `.html` nav bug: bare `iframeEl` in `_navigateToPath` — lines 1476-1485; only declaration is the `_setupVfsBridgeHandlers` param — line 1944.

## Re-verify if you can (shell was flaky earlier; these are now sha-pinned but worth a live check)
1. The `.html` ReferenceError (the 1-line test above) — **highest priority**.
2. Which section page-types actually post `sg-app-ready`.
3. Whether a distinct not-found message is posted (today: renders a "Page not found
   in this vault" srcdoc, line 1560 — screenshot-able; machine signal unconfirmed).
