# Changelog — Vault UI v0.2.4: phone-first responsiveness + "Desktop view" toggle

**Date:** 2026-06-08
**Author:** Explorer (Claude Code session `claude/stoic-ritchie-VzEbI`)
**Trigger:** Dinis brief — vault UI is unusable/broken on mobile; resize broken on
touch, large parts inaccessible on narrow viewports. Follow-up to the 06/07 mobile
audit + decisions doc (`team/humans/dinis_cruz/claude-code-web/06/07/v0.33.2__decisions__vault-ui-mobile-ia.md`).
**Locked decision:** "Toggle + responsive" zoom model, floor 390px, cut as v0.2.4.

---

## What shipped

New IFD minor `sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.4/` — a verbatim superset
copy of v0.2.3 plus a mobile delta on the `/vault` shell chrome. Two composable
mechanisms deliver Dinis's "desktop is the canonical layout, mobile is a skin you
can shed" model:

1. **Responsive (default).** Viewport stays `width=device-width`, so the layout
   viewport is the phone's real width and new `@media (max-width: 600px)` rules
   (floor 390px) give a phone-first skin.

2. **Desktop view (escape hatch).** A persistent toggle rewrites the viewport meta
   to `width=1280`; the browser fits-to-width, showing the full desktop layout
   zoomed out (small fonts ok), and the phone `@media` rules stop matching because
   the layout viewport is now 1280px. The user pinch-zooms from there. This is also
   the only lever that makes the external CDN `send-browse` file browser (which we
   can't restyle) usable on a phone.

### Files

| File | Change |
|------|--------|
| `_common/js/vault-loader/vault-view-mode.js` | **NEW** — `window.SGVaultViewMode` (`getMode`/`isDesktop`/`setMode`/`toggle`). Per-device persistence in `localStorage['sg-vault-view-mode']`. Applies viewport at `<head>` time (no flash). No-ops when embedded (iframe) — parent owns the viewport. Emits `sg-vault-view-mode-changed`. |
| `index.html`, `en-gb/browse/index.html` | Load `vault-view-mode.js` synchronously in `<head>`; titles + `app-init` version → v0.2.4. |
| `_common/js/components/vault-header/vault-header.js` | "💻 Desktop view" / "📱 Mobile view" item in the ⋯ overflow menu; live re-label; `@media` block (shrink brand/name, 44px taps, glyph-only "Vaults" button, menu width cap). |
| `_common/js/components/vault-nav/vault-nav.js` | `@media` — 44px tap targets on the icon rail. |
| `_common/js/components/vault-status-bar/vault-status-bar.js` | `@media` — tighter gap, ellipsised stats. |
| `_common/js/components/vault-auth/vault-auth.js` | `@media` — banner wraps to message row + full-width input/buttons; 44px taps. |
| `_common/js/components/vault-settings/vault-settings.js` | `@media` — full-width panel, stacked key row, 44px taps. |
| `_common/js/components/vault-shell/vault-shell.js` | `@media` — debug sidebar capped to 88vw, scrollable settings sub-tabs, sync-notice wraps. |
| `_common/css/design-tokens.css` | New `--touch-target: 44px` token. |
| `_common/js/components/app-shell/kernel-shell-bundle.js` | Regenerated (see "Bundle" below). |
| `.github/workflows/deploy-ui-vault.yml` | `UI_VERSION` + `SOURCE_DIR` → v0.2.4. |
| `scripts/build-kernel-shell-bundle.py` | `ROOT` → v0.2.4. |
| `tests/**` (37 files) | Version path constants repointed v0.2.3 → v0.2.4 so the gate tests the deployed version. |

### Out of scope (deferred — Phase B)
`<sg-layout>` reconfiguration, bottom-tab chrome, sheet-style modals, QR vault-key
entry, touch drag-and-drop, restyling the external `send-browse` browser.

### Bundle note
The committed v0.2.3 `kernel-shell-bundle.js` was **stale** vs its own app-shell
sources (229,034 on disk vs 229,898 fresh — recent app-shell fixes were never
re-bundled). The bundle is a pure concatenation, so this was pre-existing, not
introduced here. v0.2.4's bundle was regenerated from v0.2.4 sources so the new
minor is internally consistent. This pulls the already-committed app-shell source
into the running bundle (including the recent `caches`-guard and embed-no-op fixes)
— an alignment, not a new behaviour change authored here.

---

## Test impact

**SHOULD pass (verified locally — green):**
- `npm run test:vault-unit` — 37 + bundle-freshness all green. The freshness test now
  passes because v0.2.4's bundle matches a fresh build from v0.2.4 sources.
- `npm run test:vault-integration` — all green.

**SHOULD break (good failure — needs attention if it doesn't):**
- Any E2E/browser test asserting **pixel positions or fixed pixel widths** of the
  vault shell chrome at narrow viewports — the new `@media` rules intentionally move
  things at ≤600px. Update the assertions to match the phone-first layout.

**Should NOT break (bad failure — investigate if it does):**
- All loader/kernel/permission/secure-channel unit + integration tests — they're
  logic tests independent of CSS; only their version path constant changed.
- Desktop-width (≥1025px) E2E — no visual change vs v0.2.3 at desktop widths.
- Embed-mode tests — `vault-view-mode.js` no-ops inside an iframe, so the embed
  contract (`sg-embed-frame`, embed-protocol) is untouched.

**Manual QA still owed (no browser in this session):**
- 390px Mobile view: header/auth/settings fit, no horizontal overflow, taps ≥44px.
- Toggle → Desktop view: full desktop layout appears zoomed-out; pinch-zoom works;
  choice survives reload (per-device).
- Toggle back → Mobile view: phone skin returns.
