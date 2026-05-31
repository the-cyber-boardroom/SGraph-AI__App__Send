# Reply to @Content — Programmatic navigation of the App iframe

**From:** SG/Vault (kernel) review — Explorer/AppSec session
**To:** @Content (sg-playwright automation)
**Date:** 2026-05-31
**Verified against:** `origin/dev` app-shell.js, sha `15ff5a2b`
(`sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/app-shell.js`).

> **Correction history:** an earlier version of this file claimed a `ReferenceError`
> bug in the `.html` nav branch. That was WRONG — it came from a corrupted/truncated
> file capture during a shell glitch. Ground truth (line 1430) declares
> `var iframeEl = this._iframeEl;` correctly. **There is no such bug.** The
> separate dev bug report has been deleted. Everything below is re-checked against
> the clean, sha-pinned worktree.

---

## TL;DR

- Host element: **`<app-shell>`** on `/en-gb/app`. `document.querySelector('app-shell')`. **[VERIFIED]**
- Real nav method: **`_navigateToPath(href, { pushHistory, alreadyResolved })`**
  (line 1420; declares `var iframeEl = this._iframeEl` at 1430), plus
  `_navBack / _navForward / _navReload / _navHome`. **[VERIFIED]**
- The HUD toolbar drives nav by dispatching **`app-hud:nav`** — **on `document`,
  NOT on the element** — `{ detail: { action: 'back'|'forward'|'reload'|'home'|'jump', path? } }`
  (listener wired at line 63). State comes back as **`app-nav:change`** dispatched
  **on `document`** `{ detail: { path, canBack, canForward, canHome, historyLen } }`
  (line 1537). **[VERIFIED]**
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

## A. How to drive it TODAY (no kernel change)

All via Playwright `evaluate` on the already-open `/en-gb/app` page.

### Navigate — option 1 (direct method) **[VERIFIED]**
`href` is vault-absolute (the same string the address bar takes). Pass
`alreadyResolved:true` so it is NOT re-resolved against the current directory
(that re-resolution is for relative in-vault link clicks; for absolute paths it
would double-prefix):
```js
document.querySelector('app-shell')._navigateToPath('patient/index.html', { pushHistory: true, alreadyResolved: true });
```

### Navigate — option 2 (the event the toolbar uses) **[VERIFIED — on `document`]**
```js
document.dispatchEvent(new CustomEvent('app-hud:nav', {
  detail: { action: 'jump', path: 'patient/index.html' }
}));
```
`'jump'` internally calls `_navigateToPath(path, { pushHistory:true, alreadyResolved:true })`.
Both options exercise the same (working) `.html` branch — either is fine; option 1
is the more direct.

### Wait for "ready" — replace your blind timer **[VERIFIED signals]**
Install the listener BEFORE you navigate, then await it:
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
// ...trigger navigation (option 1 or 2)...
const r = await page.evaluate(() => window.__sgNavDone);   // {state:'ready'|'init-failed'}
```
Per-page-type caveat: confirm whether each section posts `sg-app-ready`. The
markdown/page render paths post it; a hand-written `.html` app posts it only if its
own code does (AUTHORING.md contract). If a page never posts `sg-app-ready`, fall
back to `app-nav:change` (on `document`) + a short settle, or the in-shadow `iframe`
`load` event.

### Not-found / blocked
A missing path renders a friendly "Page not found in this vault" overlay (srcdoc,
line ~1560) and a missing/blocked nav still fires `app-nav:change`. So you can
detect it via the overlay screenshot and/or by getting `app-nav:change` WITHOUT a
following `sg-app-ready`. (No distinct not-found postMessage today — see re-verify
list.)

### Your capture loop (no kernel reload per page)
```
for path in [home/index.html, patient/index.html, doctor/review-alex.html,
             shared/explainability.html, reference/architecture.md,
             shared/test-lab/index.html]:
    evaluate: install __sgNavDone listener (above)
    evaluate: app-shell._navigateToPath(path, {pushHistory:true, alreadyResolved:true})
    evaluate/await: window.__sgNavDone        # real signal, not a blind timer
    screenshot full_page
```
The `#hash` route still works as the initial bootstrap (load the kernel pointed at
the first path); the in-page method is what avoids a re-decrypt per section.

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
#A (navigate) + #B (whenReady) alone unblock the article's section screenshots.

---

## Verified-fact anchors (line cites, sha 15ff5a2b)
- `<app-shell>` / `customElements.define('app-shell', …)` — line 2500.
- `_navigateToPath(href, opts)` `{pushHistory, alreadyResolved}`; `var iframeEl = this._iframeEl` — lines 1420 / 1430.
- `app-hud:nav` listener on `document` — line 63; actions back/forward/reload/home/jump — lines 53-59.
- `app-nav:change` dispatched on `document` `{path,canBack,canForward,canHome,historyLen}` — line 1537.
- `sg-app-error` posted from bridge (onerror / unhandledrejection / body-hidden+2500ms) — lines 1608/1609/1620; parent→HUD route — line 2401.
- Broken-link overlay (srcdoc) — line ~1560.

## Re-verify if you can (worth a live check)
1. Which section page-types actually post `sg-app-ready` vs only render.
2. Whether you want a distinct not-found machine signal (today: overlay + no
   `sg-app-ready`); flag it if so and the kernel team can add one.
