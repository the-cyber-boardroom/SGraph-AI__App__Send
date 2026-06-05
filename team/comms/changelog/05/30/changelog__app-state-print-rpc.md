# Changelog — sg.state.* (kernel localStorage) + print bridge-RPC + ⋯ menu z-index fix

**Date:** 2026-05-30 (Commit B2 — follow-up to
`changelog__app-nav-bar-bug-fix-and-home-button.md`)
**Author:** Explorer (Claude Code session `claude/wizardly-bell-wcBUT`)
**Trigger:** Continuation of the original Commit B plan (deferred from
Commit A); user-reported "⋯ menu does nothing" diagnosed as a z-index /
overflow-clip issue (correct intuition: "could it be that it is working but
it is showing behind the iFrame?").

---

## 1. ⋯ recent-pages menu now visible (visual bug, not a behaviour bug)

The user noticed the click did nothing visually. Diagnosis: the menu *was*
rendering inside the HUD's shadow DOM (the previous fix made the open/close
cycle work), but two CSS issues clipped it from view:

1. **`#hud-host` had `overflow: hidden`** (left over from when the HUD was a
   fixed 48px row). The dropdown panel is `position: absolute` and extends
   *below* the HUD into the iframe area — the `overflow: hidden` on the host
   container was clipping it.
2. **`#hud-host` had no positioning context**, so its z-index defaulted to
   `auto`. `#layout-host` (the iframe container) is a later sibling in the
   flex column, which under default stacking-context rules paints on top of
   earlier siblings where they overlap. Even unclipped, the panel would have
   rendered behind the iframe.

**Fix** (in `en-gb/app/index.html`):

```css
#hud-host { flex: 0 0 auto; position: relative; z-index: 10; }
/* removed: overflow: hidden */
```

`z-index: 10` establishes a stacking context above the iframe area; removing
`overflow: hidden` lets the panel paint outside its host's box. The panel's
own `z-index: 100` inside the shadow root continues to work as the in-HUD
ordering.

---

## 2. `sg.state.*` — device-local preferences API

New bridge namespace exposed to every app frame:

```js
sg.state.get(key)            // → Promise<value | null>
sg.state.set(key, value)     // → Promise<{ ok: true }>           — value is JSON.stringified
sg.state.remove(key)         // → Promise<{ ok: true }>
sg.state.clear()             // → Promise<{ ok: true, removed }>  — only keys for THIS app
sg.state.keys()              // → Promise<string[]>               — un-namespaced keys
```

**Backed by the top-level kernel's `localStorage`**, namespaced as:

```
sg-app-state:<vaultId>:<appEntryPath>:<key>
```

- `vaultId` = `vault._vaultId` (a derived non-secret identifier — **NOT** the
  vault key; we deliberately never put the vault key in localStorage).
- `appEntryPath` = `self._appEntryPath` (the entry HTML path, e.g.
  `home/index.html`). Captured at `_mountApp` time (Commit B1).
- 64 KiB per-value cap — keeps a runaway app from exhausting the per-origin
  localStorage quota (shared with the vault browser + every other app on
  this domain). Returns `'value too large (max 64 KiB)'` if exceeded.
- All operations wrapped in `try/catch` — a single bad JSON or quota error
  doesn't poison the bridge handler.

### Doctrine deviation (forward-flag for Architect / DevOps)

The ViV implementation pack
(`team/roles/dev/reviews/05/28/viv-implementation/04-PHASES-4-6-and-tests-and-repair.md`,
**repair checklist item #1**) prescribes:

> Replace `localStorage` access with
> `sg.vfs.read/write('app-state/<key>.json')`

**This commit deliberately deviates** from that prescription for the
device-local-prefs use case (theme, panel widths, "don't show again"
dismissals). The rationale:

| Concern | `sg.vfs("app-state/*.json")` | `sg.state` (this commit) |
|---|---|---|
| Persists to vault (visible to everyone with the key) | yes | no |
| Survives device wipe / new browser | yes | no |
| Requires a vault write on every change | yes | no |
| Cross-device sync | yes (via `sgit push`) | no |
| Right home for "theme toggle" | no | yes |
| Right home for "draft answers to questionnaire" | yes | no |

Apps that want **vault-persistent** state (questionnaire drafts, journal
entries, anything that should travel with the vault) continue to use
`sg.fs.write(".app-state/<key>.json")` directly — that path is **NOT**
removed and remains the right tool for that job.

`sg.state` is the right tool for **device-local prefs** that shouldn't
trigger a vault commit on every toggle. The two APIs are complementary, not
mutually exclusive.

A follow-up architect brief should formalise the split if this pattern is
accepted, and the ViV repair checklist item should be re-scoped to "apps
must NOT bypass either `sg.state` or `sg.fs` and use raw `localStorage`
directly" rather than "all localStorage moves to vfs".

---

## 3. Print bridge-RPC (restores Print under null-origin srcdoc)

Commit A hid the Print button by default (`show.print: false`) because ViV
Phase 3 had flipped app frames to null-origin srcdoc, which makes
`iframe.contentDocument` throw `SecurityError` from the parent — and the
previous `_onPrint` implementation read `contentDocument` to walk the DOM.

This commit restores Print compatibility by **moving the DOM-walk into the
iframe** (which can read its own document) and routing the result back to
the parent via a new bridge RPC. Default flipped back to `show.print: true`.

### Flow

1. User clicks Print on the HUD → `app-hud:print` event → `app-shell._onPrint`.
2. `_onPrint` generates a request id and posts `{__sgPrintReq: id}` to the
   iframe via `iframe.contentWindow.postMessage(...)`. (Parent → iframe is
   fine even for null-origin frames; only contentDocument reads are blocked.)
3. The bridge script's `__sgPrintReq` listener (added in this commit, lives
   inside the iframe):
   - clones `document.documentElement`
   - fetches every `<img src="blob:...">` and
     `<link rel="stylesheet" href="blob:...">` URL and converts them to
     `data:` URIs via `FileReader.readAsDataURL` (the blobs belong to the
     iframe and would dangle in a separate print window otherwise)
   - strips all `<script>` tags (they would error or hang in the print
     preview where the bridge isn't installed)
   - posts `{__sgPrintReply: id, ok: true, html: "<!DOCTYPE html>\n" + clone.outerHTML}`
     back to the parent
4. `_onPrint` awaits the reply (5-second timeout — if it fires, the print
   simply doesn't open and an error logs to the console) and hands the HTML
   to `SgPrint.printHtml(html, title)`.

### Why not just promote app frames to SecureChannel?

That's the ViV pack's Phase 6 — beyond the scope of this commit. The
postMessage bridge already exists, has a stable request-reply pattern
(`__sgCmdId` / `__sgCmdReply`), and the print RPC fits the same shape (just
parent-initiated instead of iframe-initiated, hence the new `__sgPrintReq` /
`__sgPrintReply` field names rather than reusing `__sgCmdType`). When the
SecureChannel migration happens, this is one of several handlers to port.

---

## Files modified

```
sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/
  app-shell.js                     +144 / -42 lines
    - Bridge script: added 'state' branch to window.sg (get/set/remove/
      clear/keys via _sgCmd("state", ...))
    - Bridge script: added __sgPrintReq listener (DOM clone, blob→data,
      script strip, __sgPrintReply post)
    - Parent message handler: added 'state' __sgCmdType branch
      (vault._vaultId + self._appEntryPath namespaced localStorage with
      64 KiB per-value cap, try/catch isolated)
    - _onPrint refactored: was iframe.contentDocument DOM walk + inline,
      now postMessage RPC + await + 5s timeout

  app-hud.js                       +7 / -5 lines
    - _resolveHudCfg: flipped show.print default from false → true in
      'full' mode (now that print works again)
    - Updated docstring referencing this changelog

sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/en-gb/app/
  index.html                       +6 / -2 lines
    - #hud-host: removed overflow:hidden; added position:relative + z-index:10
      so the ⋯ recent-pages menu renders above the iframe instead of being
      clipped + occluded
```

---

## Test impact

### Tests that SHOULD break (good failures — code surface changed)

- **None expected.** The new `state` command type is additive (the parent's
  cmdType branches are exhaustive only for the types they enumerate;
  unrecognised types reply with an error). `_onPrint` is parent-internal and
  not directly tested today.

### Tests that should NOT break (bad failures — file me an issue if they do)

- `tests/unit/vault_ui/loader/test__app_permissions.js` — `AppPermissions`
  floor checks are unchanged; `sg.state` keys are not vault paths.
- `tests/unit/vault_ui/loader/test__kernel_*.js` — kernel/relay/broker code
  untouched; the new RPCs are on the legacy postMessage bridge.

### Tests not yet added (follow-up)

- `test__sg_state.js` — unit test for the namespace key shape + size cap
  semantics (would benefit from extracting a pure helper from the parent
  state handler, e.g. `AppState.namespace(vaultId, entryPath)` and
  `AppState.encode(value)`).
- `test__print_snapshot.js` — Playwright e2e: load a real app with a blob:
  image, click Print, intercept the SgPrint.printHtml argument, assert the
  HTML contains `data:image/...` (no blob:).

---

## Browser verification status

Not browser-tested locally (sandbox limits). Verification scenarios for
this delta:

1. **⋯ menu** — click the ⋯ button on the nav row. The Recent Pages dropdown
   should appear *below* the button, overlapping the top of the iframe area
   (not clipped, not behind). Click outside → dismisses. Click an item →
   navigates. (Previously: nothing appeared.)
2. **sg.state** — in any app, run from the iframe console:
   ```js
   await sg.state.set('test', { theme: 'dark' });
   await sg.state.get('test');         // → { theme: 'dark' }
   await sg.state.keys();              // → ['test']
   ```
   Then reload the page and re-run `sg.state.get('test')` — value persists.
   Open the same app from a DIFFERENT vault key → `sg.state.get('test')` is
   `null` (correctly namespaced).
3. **Print** — click the 🖨 Print button on the HUD. A print preview window
   should open with the rendered app, blob: images inlined, scripts stripped.
   (Previously: silent SecurityError in the console; nothing happened.)
4. **Regression** — every Commit A + B1 scenario still works (hash links,
   back/forward, broken-link overlay, Home button, editable URL bar,
   external links).
