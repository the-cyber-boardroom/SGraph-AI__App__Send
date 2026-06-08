# Changelog — Nav bar bug fixes + Home button + editable URL bar

**Date:** 2026-05-30 (follow-up to earlier today's `changelog__app-nav-bar-hud-config.md`)
**Author:** Explorer (Claude Code session `claude/wizardly-bell-wcBUT`)
**Trigger:** User reports during live test of Commit A nav bar.

---

## Bugs fixed

### 1. Path-doubling in back / forward / reload (HIGH)

**Symptom:** Click Back from `shared/test-lab/index.html` → friendly broken-link
overlay appears showing `shared/test-lab/home/index.html` (incorrect; the doubled
prefix is a fiction). HUD shows the correct `home/index.html`. Same root cause
produced `shared/test-lab/shared/test-lab/index.html` after a series of back/forward
clicks (also reported, separate screenshot).

**Root cause:** `_navigateToPath(href)` always called
`this._resolvePath(this._htmlDir, pathPart)` before looking up the file. History
entries (back/forward/reload) carry **already-resolved vault-absolute paths**
(because `_pushNavHistory` stores `match.path`, which is the resolved name from
the previous successful lookup). Re-running `_resolvePath` against the *current*
`this._htmlDir` (which has since changed to whatever directory you're now in)
prepends that directory to the absolute path, producing a phantom doubled-prefix
path that no longer exists in the vault → broken-link overlay.

**Fix:** new `alreadyResolved: true` option on `_navigateToPath`, passed by
`_navBack` / `_navForward` / `_navReload` / `_navHome` and by the recent-pages
menu 'jump' action. When set, `pathPart` is used as-is. The default
(`alreadyResolved !== true`) is unchanged — the bridge click-interceptor still
goes through `_resolvePath` because its hrefs are relative to the current page.

### 2. ⋯ recent-pages menu opens and immediately closes (MEDIUM)

**Root cause:** the outside-click listener for "close menu on click outside"
was attached to `document`. Click events in shadow DOM bubble up to `document`
with `composed: true` by default, so the click that opened the menu *also*
reached the document handler one event-loop step later, saw `_menuOpen = true`,
and closed the menu.

**Fix:** rewrote `_toggleMenu` to arm the outside-click listener as a one-shot
on the *next* event-loop turn (`setTimeout(..., 0)`). The opening click has
fully propagated by then, so the next click anywhere closes the menu cleanly.
Also added `e.stopPropagation()` on the ⋯ button click — defensive in case the
listener races, and means clicking the ⋯ button while the menu is open
re-toggles through the shadow handler instead of being eaten by the doc handler.

---

## New behaviour

### 3. Home button (⌂) in the nav row

User feedback: *"we need a home button to go back to the app's root (I had to
reload the page to get there)"*. Added `<button class="navrow-home">⌂</button>`
between Reload and the divider. Enabled when current path ≠ entry path,
disabled when already on home (so the button doesn't lie about its
affordance). Click → `_navHome()` → `_navigateToPath(this._appEntryPath, {
alreadyResolved: true, pushHistory: true })`. A new history entry is *pushed*
(rather than rewinding) — going Home from a deep page shouldn't erase your
forward stack the way Back/Forward do.

`_appEntryPath` is captured at `_mountApp` time, alongside the history-seed
push. `_emitNavChange` now reports `canHome` in the event detail.

The HUD config gets a new flag: `hud.show.navHome` (defaults: `true` in
`full` mode, `false` in `minimal` mode).

### 4. Editable URL bar

User feedback: *"I think the url should be editable (like a normal url is)
and navigate on enter. Note that I can already copy the url on that copy
button you added"*.

The `.navrow-addr` div now contains an `<input class="navrow-addr-input">`
alongside the read-only `<span class="navrow-addr-text">`. Click anywhere on
`.navrow-addr` (other than the input itself) flips into edit mode:

- `_enterAddrEdit()` hides the text + icon, shows the input pre-filled with
  the current path, focuses it, and selects all (Chrome URL-bar convention).
- Enter key → `_exitAddrEdit(true)` → if the value changed, dispatch
  `app-hud:nav` with `action:"jump"`. App-shell treats jump paths as
  `alreadyResolved: true`, so the user types vault-absolute paths
  (`home/index.html`), not relative ones.
- Escape or focus-loss → `_exitAddrEdit(false)` → revert to display mode,
  no navigation.

The explicit `⎘` copy button on the right still does click-to-copy — the user
already noted that, so click-on-path is now *only* for editing.

`setNavState` is guarded against overwriting the read-only text while
`_editingAddr` is true, so async nav-change events arriving mid-type don't
visually flicker behind the input.

### 5. External-link bridge (partial Commit B)

Already-in-progress work from the original Commit B plan: external links
(`http://`, `https://`, `//`) in app frames used to fall through to default
browser navigation, which the sandbox blocked (the eur-lex error the user
reported earlier). Two-part fix:

1. App-frame sandbox attribute now includes
   `allow-popups allow-popups-to-escape-sandbox` so the new tab actually
   opens. Applied at all four app-frame mount sites (`_mountApp`,
   `_mountPageLayout`, `_mountVaultFile` HTML, `_mountVaultFile` markdown).
   The headless ViV kernel iframe (`_spawnChildChannel`, line 928) is
   **NOT** touched — it has no UI and shouldn't be able to open popups.
2. The bridge click-interceptor now handles `http://` / `https://` / `//`
   links by calling `window.open(href, "_blank", "noopener,noreferrer")`
   from inside the iframe synchronously within the click handler — that
   keeps the user-gesture intact, avoiding the popup-blocker hit that a
   postMessage round-trip to the parent would incur.

Deferred from the original Commit B plan (will land separately): `sg.state.*`
kernel-localStorage namespace, and the bridge-RPC print path. The Print
button stays hidden by default (`show.print: false`) until the print refactor.

---

## Test impact

- **Tests that should NOT break:** none touched directly. The `_resolvePath`,
  `_findEntry`, and overlay rendering code is unchanged — only the call site
  in `_navigateToPath` learnt a new option.
- **Tests not yet added** (carried over from the previous changelog):
  unit test for `AppHud._resolveHudCfg`; unit test for the nav-history stack
  semantics. With this commit there's additionally the address-bar edit
  state machine to cover (`_enterAddrEdit` / `_exitAddrEdit` + the Enter
  / Escape / focusout dispatchers) — Node-side testable once the
  customElements stub pattern is in place.

## Browser verification status

Not browser-tested locally (same sandbox limits as the parent commit). User
walking through the live dev environment. Key scenarios for this delta:

1. Navigate deeper (Home → some page → another page) → click Back. Should
   land on the correct page; the broken-link overlay should NOT appear
   for a path that exists.
2. Click ⋯ → recent-pages menu should stay open until you click outside
   or pick an item.
3. Click the Home button (⌂) → should jump to the app's entry page.
   Should be disabled when already there.
4. Click on the URL path → should become an editable text field with the
   path selected. Type a new path, press Enter → navigates. Press Escape
   → restores the original.
5. Click an external link in an app (e.g. `https://eur-lex.europa.eu/...`)
   → should open in a new tab.
