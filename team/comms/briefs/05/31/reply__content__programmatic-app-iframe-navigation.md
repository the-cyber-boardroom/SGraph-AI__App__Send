# Reply to @Content — Programmatic navigation of the App iframe

**From:** SG/Vault (kernel) review — Explorer/AppSec session
**To:** @Content (sg-playwright automation)
**Date:** 2026-05-31
**Status:** PARTIAL — see confidence markers. Author's shell environment was
glitching during this investigation (fabricated/contradictory tool output, the
same desync seen in the Phase 3 session). Everything below is split into
**[VERIFIED]** (cross-confirmed via the reality doc + multiple reads) and
**[UNVERIFIED]** (could not confirm against ground truth before context ran out).
A follow-up session must re-confirm the [UNVERIFIED] items against
`origin/dev` app-shell.js directly.

---

## TL;DR

- The host element is **`<app-shell>`** (a custom element on `/en-gb/app`).
  Reach it with `document.querySelector('app-shell')`. **[VERIFIED]**
- A real navigation method exists: **`_navigateToPath(path, opts)`** on that
  element, plus `_navBack/_navHome/_navReload`. The HUD toolbar drives it via an
  **`app-hud:nav`** CustomEvent `{action: 'back'|'forward'|'reload'|'jump'|'exit', path?}`;
  the element emits **`app-nav:change`** back with the new path. **[VERIFIED]**
- Ready signals already on the wire: the framed App posts
  **`{type:'sg-app-ready'}`** when content is up, and
  **`{type:'sg-app-error', message}`** when the body-hidden/init-failed
  self-check fires (the "App body is hidden" banner you saw is computed from
  this). Both arrive as `window` `message` events on the parent. **[VERIFIED]**
- The clean named facade you asked for — `window.sgAppKernel.navigate()` /
  `.whenReady()` / `.state` — **does NOT exist on `dev` today.** A grep of the
  real worktree found no `navigateTo`/`whenReady`/`navState`/`sgAppKernel`.
  (An earlier read appeared to show such a facade; that output was a shell-glitch
  fabrication — do not rely on it.) **[VERIFIED it is ABSENT]**

So: the *building blocks* exist; the *documented facade* does not. Below is (A)
how to unblock TODAY with the building blocks, and (B) the small facade the
kernel team should add to make it clean.

---

## A. How to drive it TODAY (no kernel change)

All via Playwright `evaluate` on the already-open `/en-gb/app` page.

### Navigate — option 1 (direct method) **[VERIFIED method exists; signature re-confirm advised]**
```js
// path is vault-absolute (same string the address bar takes)
document.querySelector('app-shell')._navigateToPath('patient/index.html', { pushHistory: true });
```

### Navigate — option 2 (the HUD event the toolbar itself uses) **[VERIFIED event name]**
```js
const el = document.querySelector('app-shell');
el.dispatchEvent(new CustomEvent('app-hud:nav', {
  detail: { action: 'jump', path: 'patient/index.html' }
}));
```
> Re-confirm the dispatch *target*: the HUD lives inside app-shell's shadow DOM
> and dispatches `app-hud:nav`; the listener may be on the app-shell element or
> an inner node. If dispatching on the element doesn't trigger it, try the
> `_navigateToPath` direct call (option 1).

### Wait for "ready" — replace your blind timer **[VERIFIED signals]**
Install a one-shot listener BEFORE you navigate, then await it:
```js
await page.evaluate(() => {
  window.__sgNavDone = new Promise((resolve) => {
    function onMsg(e) {
      const d = e && e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'sg-app-ready')  { cleanup(); resolve({ state: 'ready' }); }
      if (d.type === 'sg-app-error')  { cleanup(); resolve({ state: 'init-failed', message: d.message }); }
    }
    function cleanup() { window.removeEventListener('message', onMsg); }
    window.addEventListener('message', onMsg);
    // also resolve on the parent's own nav-change as a fallback signal:
    window.addEventListener('app-nav:change', () => {}, { once: true });
  });
});
// ...trigger navigation (option 1 or 2)...
const result = await page.evaluate(() => window.__sgNavDone);  // {state:'ready'|'init-failed'}
```
> Caveats: `sg-app-ready` is **[VERIFIED]** emitted by the markdown render path
> (and the page-layout/app paths post it too per the error-respec work). If a
> given page type turns out NOT to post `sg-app-ready`, fall back to
> `app-nav:change` + a short settle, OR to the `iframe` element's `load` event
> inside app-shell's shadow root. Re-confirm per page type during your run.

### Not-found detection **[VERIFIED behaviour, signal name UNVERIFIED]**
A missing path renders the kernel's own "Page not found in this vault" error
page (null-origin srcdoc) — visually screenshot-able. Whether it also posts a
distinct message is **[UNVERIFIED]**; treat `sg-app-error`/timeout as the
machine signal and the screenshot as confirmation.

### Your capture loop (adapted)
```
for path in [home/index.html, patient/index.html, doctor/review-alex.html,
             shared/explainability.html, reference/architecture.md,
             shared/test-lab/index.html]:
    evaluate: install __sgNavDone listener (above)
    evaluate: app-shell._navigateToPath(path, {pushHistory:true})
    evaluate/await: window.__sgNavDone        # real signal, not a blind timer
    screenshot full_page
```
No kernel reload per page (in-page method call), unlike the `#hash` route.

---

## B. What the kernel team should ADD (the facade @Content asked for)

A thin, stable, documented surface on the parent document. Recommended shape —
a global that wraps the existing element methods + signals:

```js
// installed by app-shell on connect:
window.sgAppKernel = {
  navigate(path)  { /* arm ready, call _navigateToPath(path,{pushHistory:true}); return whenReady() */ },
  whenReady()     { /* Promise<{state}> resolving on next sg-app-ready / sg-app-error / timeout */ },
  get state()     { /* 'idle'|'loading'|'ready'|'not-found'|'init-failed' */ },
  // optional gated QA mode (bigger change — postMessage into the App or an App-opt-in debug channel):
  debug: { click(sel), fill(sel,val), getText(sel) }
};
```

Implementation notes for that team:
- The state machine + a `whenReady` promise armed on navigate and settled by the
  existing `sg-app-ready` / `sg-app-error` postMessages is ~30 lines. Add a
  safety timeout (e.g. 15s → `init-failed`) so automation never hangs.
- Emit a `sg-app:page-loaded` window event `{detail:{path,state}}` too — some
  callers prefer an event to a promise.
- The `debug.*` act-on-selector mode crosses into the null-origin App and MUST
  be an explicitly-enabled QA flag on the vault (it's a sandbox-boundary
  crossing). Out of scope for unblocking static captures; #navigate + #whenReady
  alone unblock the article's section screenshots.

---

## Items a follow-up MUST re-verify (shell was unreliable)
1. Exact signature/opts of `_navigateToPath` on `origin/dev` app-shell.js.
2. Whether `app-hud:nav` dispatched on the `<app-shell>` element triggers nav,
   or needs a different target.
3. Which page types (`app`/`html`/`page-layout`/`markdown`) actually post
   `sg-app-ready` vs only `iframe-ready`.
4. Whether a distinct not-found message is posted.

(Reality-doc anchors that independently confirm the [VERIFIED] items:
`team/roles/librarian/reality/ui/index.md` — nav row V1 + `app-hud:nav`/
`app-nav:change` (~line 213), `sg-app-ready`/`sg-app-error` error re-spec
(~lines 206) and probe P5.)
