# Changelog — App-mode in-vault nav bar + HUD config + hash-link bug fix

**Date:** 2026-05-30
**Author:** Explorer (Claude Code session `claude/wizardly-bell-wcBUT`)
**Brief:** none — conversational session driven by user reports of broken `#fragment` links
inside the running Standards Atlas app (`https://dev.vault.sgraph.ai/pages/evidence.html#e-gh-detections`)

---

## Summary

This is **Commit A** of a two-commit set ("legacy bridge + parent UI"). It fixes the
broken in-vault hash-link bug, ships a friendly broken-link dead-end page, adds an
in-HUD nav row with back / forward / refresh / path display / copy-path / recent-pages
menu, and introduces an `app.json` HUD config schema (`hud.mode` + `hud.show.*`) plus a
sovereignty rail (consent always renders, hidden-mode escape pill, user-side force-show
override). **Commit B** (follow-up) will add `sg.shell.openExternal`, `sg.state.*`
(kernel-localStorage backed — deliberate deviation from the ViV impl-pack's
`sg.vfs('app-state/*')` doctrine — see deviation note below) and a bridge-RPC fix for
the print regression introduced by ViV Phase 3 (null-origin srcdoc).

---

## The hash-link bug (root cause)

The iframe click interceptor injected into every app frame
(`app-shell.js:_buildVfsBridgeScript`) did:

```js
if (h.endsWith(".html") || h.endsWith(".htm")) { /* intercept + postMessage */ }
```

When the href included a `#fragment` (e.g. `pages/evidence.html#e-gh-detections`), the
string ended with `#e-gh-detections`, **not** `.html` — so `endsWith` returned `false`,
the interceptor skipped the click, the browser did its default navigation, the iframe
landed on `https://dev.vault.sgraph.ai/pages/evidence.html`, and the static host returned
**403 (S3 AccessDenied)** — the dead-end screen the user reported. Same regression for
`?query` strings, though those are rarer in practice.

**Fix:** strip `?`/`#` before the extension check, but forward the **original** href
(with fragment) to the parent so the new srcdoc can scroll to the anchor. The parent
posts `{__sgVfsScrollToHash: "fragment"}` to the iframe after the swap; a new bridge
listener applies it on `DOMContentLoaded`.

---

## Files Modified

```
sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/
  app-shell.js                     +213 / -23 lines
    - Click interceptor: strip ?/# before endsWith check (BUG FIX)
    - Bridge script: add __sgVfsScrollToHash listener (anchor scroll after nav)
    - Constructor: add _navHistory, _navIndex (back/forward stack)
    - New methods: _navigateToPath, _pushNavHistory, _navBack, _navForward,
      _navReload, _canNavBack, _canNavForward, _currentNavPath, _emitNavChange,
      _renderBrokenLinkOverlay, _exitApp
    - Refactored: nav handler now delegates to _navigateToPath
    - app-shell:ready event detail now includes hudCfg from app.json
    - connectedCallback: listen for 'app-hud:nav' events (back/forward/reload/jump/exit)
    - _mountApp: seed nav history with the entry path

  app-hud.js                       +296 / -7 lines
    - Template: add .navrow section under the chrome row (V1: back/forward/refresh
      + path display + copy + recent-pages menu — type-to-jump address-bar input
      deferred to a follow-up)
    - Template: add .hud-escape corner pill (rendered only in mode:"hidden")
    - New methods: setNavState, applyHudConfig, _emitNavEvent, _toggleMenu,
      _renderMenu, _copyCurrentPath, _updateRecent, static _resolveHudCfg,
      static _escapeHtml
    - Click handler: nav row buttons + escape pill
    - Listens for 'app-nav:change' from app-shell
    - Closes recent-pages menu on outside click

sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/en-gb/app/
  index.html                       +14 / -3 lines
    - #hud-host: removed fixed 48px height; auto-sizes for nav row
    - app-shell:ready handler: now calls hud.applyHudConfig(...) with optional
      user-side localStorage override (sg-app-force-show-hud=1 forces full mode)
```

---

## New API surface

### `app.json` schema additions (optional, all keys default to "full mode")

```json
{
  "hud": {
    "mode":  "full" | "minimal" | "hidden",
    "show": {
      "vaultName":  true,
      "appTitle":   true,
      "openVault":  true,
      "copyLink":   true,
      "print":      false,
      "debug":      true,
      "navBar":     true,
      "navArrows":  true,
      "navPath":    true,
      "navRefresh": true
    }
  }
}
```

- `mode: "hidden"` — chrome row + nav row both hidden; iframe gets the full viewport.
  A corner escape pill remains (cannot be hidden).
- `mode: "minimal"` — chrome row collapsed to vault name + title only; no nav row,
  no Debug button. Best for reading-mode apps.
- `mode: "full"` (default, current behaviour + nav row).
- `show.*` granular overrides on top of the mode defaults.

### New events

- **`app-nav:change`** (dispatched by AppShell on every navigation; consumed by AppHud)
  `detail: { path, canBack, canForward, historyLen }`
- **`app-hud:nav`** (dispatched by AppHud; consumed by AppShell)
  `detail: { action: "back" | "forward" | "reload" | "jump" | "exit", path?: string }`

### New AppHud methods (web component API)

- `setNavState({ path, canBack, canForward, historyLen })`
- `applyHudConfig(hudCfg)` — idempotent; safe to call before `setInfo`

---

## Sovereignty rail (apps cannot suppress)

1. **Consent prompts** — the `requestConsent` overlay always renders when active,
   regardless of `hud.mode`. Unchanged from prior behaviour; verified the consent
   element is not under any `data-hud-el` flag.
2. **Escape pill** — in `mode:"hidden"`, a fixed-position `× Exit app` pill
   (top-right, `z-index: 9999`) remains visible. Click → returns to `/en-gb/vault/`.
3. **User-side override** — set `localStorage.setItem('sg-app-force-show-hud', '1')`
   and reload to force `mode:"full"` regardless of `app.json`. (Page-script level, not
   bypassable by apps.)

---

## Test impact classification

### Tests that SHOULD break (good failures — code surface changed)

- **None expected to break.** The bug fix preserves all previous nav semantics for
  href without `#`/`?`; the new methods are additive. Existing tests do not assert on
  the click-interceptor string contents.

### Tests that should NOT break (bad failures — file me an issue if they do)

- `tests/unit/vault_ui/loader/test__app_permissions.js` — AppPermissions floor check
  is still honoured by `_navigateToPath` (same `isFloor('read', resolved)` call as before).
- `tests/unit/vault_ui/loader/test__kernel_parent.js` and `test__kernel_relay.js` —
  ViV mount/relay logic untouched; only the legacy `__sgVfsNavReq` path was refactored.
- `tests/e2e/vault_ui/test__viv_browser_e2e.spec.js` — end-to-end null-origin app flow
  should still work; the nav-bridge changes don't touch SecureChannel/KernelBroker.
- `tests/e2e/vault_ui/test__phase3_null_origin_probe.spec.js` — sandbox spec unchanged.

### Tests that are NOT YET added (follow-up)

- `tests/unit/vault_ui/loader/test__app_hud_config.js` — `AppHud._resolveHudCfg`
  defaults + override resolution (pure static, easy to unit-test via the
  customElements.define stub pattern).
- `tests/unit/vault_ui/loader/test__app_shell_nav_history.js` — `_pushNavHistory`
  / `_navBack` / `_navForward` (would benefit from extracting a pure helper out of
  AppShell first).

The nav-bar HTML rendering itself needs a browser E2E to verify visually.

---

## ViV impl-pack doctrine deviation note (forward-flag for Commit B)

The ViV implementation pack (`team/roles/dev/reviews/05/28/viv-implementation/04-PHASES-4-6-and-tests-and-repair.md`,
repair checklist item #1) prescribes:

> Replace `localStorage` access with `sg.vfs.read/write('app-state/<key>.json')`

Commit B (next) will introduce `sg.state.*` backed by the **top-level kernel's
`localStorage`** (with a namespaced prefix `sg-app-state:<vaultKey>:<appEntryPath>:`),
**not** by `sg.vfs`. This is a deliberate decision by the project owner (Dinis Cruz,
2026-05-30 session) for the device-local-preferences use case (theme, panel widths,
"don't show again" dismissals) where vault-write-on-every-toggle is undesirable. Apps
that want vault-persistent state can continue to use `sg.fs.write('.app-state/...')`
directly — `sg.state` complements rather than replaces that path.

The deviation will be documented in Commit B's changelog and a follow-up architect brief.

---

## Print-button regression (NOT fixed in this commit)

The Print feature added on this branch (`57de4e67 feat(app-mode): add Print button to
the HUD with blob-URL inlining`) is broken on dev because ViV Phase 3 flipped app
frames to null-origin srcdoc; `iframe.contentDocument` throws `SecurityError` from the
parent. The Print button is hidden by default in this commit's `_resolveHudCfg`
(`show.print: false`) to avoid surfacing a broken feature. **Commit B** will add a
bridge-RPC print path (app posts a DOM snapshot via SecureChannel, parent reconstructs
and prints) and flip the default back to `true`.

---

## Browser verification status

**Not browser-tested locally** — the implementation environment is sandboxed without a
browser. Syntax-checked via `node --check`. The user (Dinis) will exercise the changes
in the dev environment after deploy. Key scenarios to walk through:

1. Click a link like `pages/skills.html#section` → should land on `pages/skills.html`
   scrolled to `#section`, no 403 dead-end.
2. Click a deliberately-broken link → should show the friendly broken-link overlay,
   ‹ Back arrow in the HUD should work.
3. Navigate ≥3 pages → back/forward arrows should enable/disable correctly; recent-
   pages menu should populate.
4. Set `app.json` `hud.mode: "minimal"` → chrome row collapses, no nav row.
5. Set `hud.mode: "hidden"` → entire HUD gone, escape pill in top-right corner.
6. Trigger a consent prompt while in `hidden` mode → consent overlay still appears.
