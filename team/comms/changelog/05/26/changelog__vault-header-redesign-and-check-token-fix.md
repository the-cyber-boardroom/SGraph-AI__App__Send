# Changelog — Vault header redesign (status pill) + access-key validation + check-token 404 fix

**Version:** (CI-assigned — see `sgraph_ai_app_send/version` after the pipeline runs)
**Date:** 2026-05-26
**Author:** Dev (Claude Code session claude/wizardly-bell-wcBUT)
**Trigger:** Dinis — redesign and declutter the vault banner/header; the sync controls,
  read-only badge, and file toolbar had overlapping/duplicate buttons, and the header
  access-key entry applied silently without validation.

---

## Summary

The vault top header (`vault-header.js`) is redesigned. The four separate sync buttons
(Check / Push / Pull / Refresh) collapse into a **single status pill** whose colour and
label reflect sync state; clicking it opens a dropdown with the explicit actions plus a
"last checked" line. Read-only state folds into the pill, and the access-key entry it
carries is now **validated** against `check-token` before write mode is enabled. Rarely
used controls (Debug, raw vault, version) move into an overflow (`⋯`) menu. Upload is
consolidated to the Files action bar only. The file preview toolbar no longer shows a
duplicate "View Source" when send-browse already provides a native source toggle. Three
`check_token` (underscore) calls in `app-shell.js` that 404'd are corrected to
`check-token` (hyphen).

The header's public setter API and emitted events are **unchanged**, so `vault-shell`
needs no rewiring.

## Pill state model

| State | Pill (colour) | Dropdown actions |
|-------|---------------|------------------|
| In sync | `● Synced` (green) | Check, Refresh, last-checked |
| Ahead | `↑N to push` (teal) | Push (N), Check, Refresh |
| Behind | `↓N to pull` (blue) | Pull (N), Check, Refresh |
| Diverged | `⇅ Diverged` (amber) | warning + Push, Pull, Check, Refresh |
| Read-only (writable vault, no key) | `🔒 Read-only` (amber) | **validated access-key entry** + Check, Refresh |
| Read-only token (RO share) | `👁 Read-only` (blue) | none — informational |
| Busy | `↑ Pushing… / ↓ Pulling… / ⟳ Checking…` | disabled |

## Files Modified

```
sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/vault-header/vault-header.js
  — Rewritten presentation: status pill + sync dropdown + overflow menu. Same public
    API/events. Access-key entry validates via GET /api/transfers/check-token/{key},
    emits vault-settings-access-key only on a valid, non-exhausted token. Removed the
    top-header Upload button. "Return to vaults" kept as visible .vh-lock-btn nav button.

sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/vault-shell/vault-shell.js
  — Removed the now-dead 'vault-header-upload' listener (the Upload button is gone;
    _onUploadRequest is still reached via 'vault-upload-request').

sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/vault-browse-edit/vault-browse-edit.js
  — File toolbar de-dup: skip the patch's "View Source" when send-browse already rendered
    a native source toggle (.sb-file__view-source — present for html/csv/markdown).

sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common/js/components/app-shell/app-shell.js
  — Fixed 3 calls /api/transfers/check_token/ → /api/transfers/check-token/ (the
    registered route uses a hyphen; the underscore form 404'd).
```

## Scope

- **Vault UI v0.2.3 only.** No backend/API changes. `send-browse` (loaded cross-origin
  from `dev.send.sgraph.ai`, owned by the user UI) is **not** modified — the toolbar
  de-dup is done entirely in the `vault-browse-edit.js` patch layer.
- The header's setter API and CustomEvents are unchanged, so `vault-shell` wiring is intact.

## Test impact

- **SHOULD break (good):** none expected. No unit/e2e test asserts on the old header
  selectors (`vh-upload-btn`, `vh-check-btn`, `vh-push-btn`, `vh-pull-btn`,
  `vh-refresh-btn`, `vh-sync-section`) or the `vault-header-upload` event — verified by
  grep across `tests/`. The container test only GETs `vault-header.js` (still 200).
  `test__regression__no_duplicate_app_mode_btn.spec.js` is `test.skip` and concerns App
  Mode, not Source.
- **Should NOT break (bad):** the push/pull/check/refresh flows (events + setters
  unchanged), inline vault rename, Open-App button, read-only/RO-token modes, and the
  `index.html` patch that relabels `.vh-lock-btn` to "Open or Create Vault".

## Verification

Rendered `vault-header.js` in isolation (Playwright + Chromium, real `design-tokens.css`,
2× DPI) and screenshotted every pill state:

- **Synced** — green `● Synced ▾`; dropdown shows Check / Refresh / "Last checked just now".
- **Ahead (3)** — teal `↑3 to push ▾`; dropdown adds `↑ Push (3)`.
- **Diverged (↑2 ↓1)** — amber `⇅ Diverged ▾`; dropdown shows the force-overwrite warning + Push (2) / Pull (1) / Check / Refresh.
- **Read-only** — amber `🔒 Read-only ▾`; dropdown shows the access-key input + Unlock, then Check / Refresh.
- **RO-token** — blue `👁 Read-only` static pill, no caret, no dropdown.
- **Overflow** — Debug / Raw vault data / version line.

Full-app verification (vault opened against a live backend with cross-origin send-browse)
was **not** run in this session — the file-toolbar de-dup is logic-only and could not be
exercised in the isolated harness. Syntax of all four modified files validated with
`node --check`.
