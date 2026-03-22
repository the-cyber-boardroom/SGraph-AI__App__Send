# Session Handoff Brief — v0.3.0 Non-Upload Parity

**Date:** 2026-03-22
**Vault:** `2y0tyre74nw684v09hf9ucx0:4xw8kugl` (token: `owasp`)
**Repo:** `SGraph-AI__App__Send` (github.com/the-cyber-boardroom/SGraph-AI__App__Send)

---

## What This Project Is

SGraph Send (`send.sgraph.ai`) — zero-knowledge encrypted file sharing. The UI has been evolving through IFD (Incremental Feature Development) overlays: v0.2.0 base → v0.2.17 as prototype-mutation overlays → v0.3.0 as a clean consolidated major version.

## What Was Done (This Session + Previous)

### Upload workflow (COMPLETE)
The 7,221-line monolithic `send-upload.js` was decomposed into 7 modules + 6 Shadow DOM sub-components (patches 0001–0011). All 16 features from v0.2.13 are implemented. This work is merged to dev.

### Non-upload gap analysis (COMPLETE)
Compared v0.3.0 against the full v0.2.x chain for everything outside upload: download components, routes, welcome flow, packaging, shared assets. Found 21 actions across 4 phases. Document is at:
- `team/roles/dev/reviews/03/22/v0.16.36__review__v0-3-0-non-upload-gap-analysis.md`
- Also in vault as `0012__non-upload-gap-analysis.patch`

### Non-upload implementation (PARTIAL)
Patches 0013–0014 implement Phase 1, Phase 2, and part of Phase 3:

**Done:**
- N1-N2: `en-gb/view/` and `en-gb/v/` route symlinks to download
- N3: `view` route detection in `send-download.js` `_detectRouteMode()`
- N4: Manual token entry form when no hash in URL (was showing error)
- N5: `test-files/` symlinked from v0.2.0
- N6: `i18n/` symlinked from v0.2.0 (17 locale JSON files)
- N7-N9: Root site files symlinked (`index.html`, `404.html`, `robots.txt`, `sitemap.xml`, `manifest.json`)
- N10: Welcome page + `send-welcome` component symlinked from v0.2.0
- N18-N19: Print buttons added to `send-viewer.js` and `send-browse.js`
- N18: Email button added to `send-browse.js` header

---

## What Needs Doing Next

### Remaining Phase 3 Items (Download Feature Gaps)

| # | Action | File | Notes |
|---|--------|------|-------|
| N13 | Gallery/folder mode switcher in header | `send-gallery.js` | v0.2.7 had a toggle to switch between gallery and folder view. v0.3.0 gallery header already has a "Folder view" link (`<a href="?id=${this.transferId}#folder">`) at line 68 but it navigates away. The v0.2.7 overlay did a seamless in-page switch. Decide if the link approach is acceptable or needs in-page switching. |
| N16 | Browse keyboard navigation (j/k, arrows) | `send-browse.js` | v0.2.1 had `j`/`k` to move between files, arrows for tree nav, `s` to save. v0.3.0 browse has none. Add a `keydown` listener on the document that moves selection in the file tree and opens files. |
| N17 | Browse share tab + info tab | `send-browse.js` | v0.2.2 had a Share tab (auto-opens on load, shows Copy Link + transfer info) and v0.2.12 added an Info tab. v0.3.0 browse has Copy Link in the header but no dedicated tabs for share/info content. This is medium complexity — need to add tab types to the existing tab system. |
| N20 | Stale response generation guard | `send-download.js` | v0.2.4 added a `_loadGeneration` counter so that if the user navigates or re-triggers `_loadTransferInfo`, stale API responses are discarded. Simple: add `this._loadGen = 0` to constructor, increment in `_loadTransferInfo`, capture in closure, check before applying result. |

### Phase 4 — Architecture Decision

| # | Action | Notes |
|---|--------|-------|
| N21 | Vendor `sg-layout.js` or keep CDN | `send-browse.js` depends on `<sg-layout>` loaded from `https://dev.tools.sgraph.ai/core/sg-layout/v0.1.0/sg-layout.js` (in `en-gb/download/index.html` line 27). This breaks the zero-external-dependency posture. Options: (A) download and add to `_common/js/vendor/`, (B) keep CDN, (C) rewrite browse without it. Needs product decision. |

### Already Present (No Action Needed)
During implementation I found these were already in v0.3.0 (my gap analysis was too conservative):
- N11: Gallery share section (Copy Link, Email buttons) — already at lines 64-65 of `send-gallery.js`
- N12: Gallery print styles (@media print) — already has 1 print media query
- N14: Gallery extension badges — already at lines 100-104 of `send-gallery.js` (BADGE_COLORS)
- N15: Gallery lightbox branding — already at line 162 of `send-gallery.js` (SG/Send logo)

---

## Key Files to Read

### Start here (gap analysis — the work plan):
```
team/roles/dev/reviews/03/22/v0.16.36__review__v0-3-0-non-upload-gap-analysis.md
```

### Codex architect review (higher-level findings, all confirmed):
```
team/roles/architect/reviews/03/22/v0.16.34__review__v0-3-0-ifd-consolidation-gap-analysis-non-send-upload.md
```

### v0.3.0 download components (the files to modify):
```
sgraph_ai_app_send__ui__user/v0/v0.3/v0.3.0/_common/js/components/send-download/
  send-download.js   — Orchestrator: URL parse, decrypt, route (N20 goes here)
  send-gallery.js    — Gallery grid + lightbox (N13 goes here)
  send-browse.js     — Folder tree + tabs (N16, N17 go here)
  send-viewer.js     — Single file viewer (done)
```

### v0.2.x download overlays (reference for how features worked):
```
sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.3/_common/js/components/send-download/
  send-download-v027.js   — Gallery/folder mode switcher (for N13)
  send-download-v021.js   — Keyboard navigation (for N16)
  send-download-v022.js   — Tab system + share tab (for N17)
  send-download-v024.js   — Generation guard (for N20)
```

### Download page HTML:
```
sgraph_ai_app_send__ui__user/v0/v0.3/v0.3.0/en-gb/download/index.html
  — Line 27: sg-layout CDN dependency (for N21 decision)
```

---

## Branch & Patch State

**Branch:** `claude/v030-non-upload-gap-analysis` (based on dev at `93706924`)
- Commit 1: gap analysis document
- Commit 2: `0013` — Phase 1+2 (routes, packaging, welcome)
- Commit 3: `0014` — Phase 3 partial (print + email buttons)

**Vault contents (patches):**
```
0001–0011  — Upload workflow (all applied, merged to dev)
0012       — Non-upload gap analysis document
0013       — Phase 1+2: routes, token entry, packaging, welcome
0014       — Phase 3 partial: print/email buttons
```

**To apply 0013+0014 on a fresh branch:**
```bash
sg-send-cli clone 2y0tyre74nw684v09hf9ucx0:4xw8kugl
cd SGraph-AI__App__Send
git checkout dev && git pull
git checkout -b ifd-v0.3.0__non-upload-parity
git am ../4xw8kugl/0013__phase1-phase2-routes-packaging.patch
git am ../4xw8kugl/0014__phase3-partial-print-email.patch
```

Note: 0013 and 0014 are `git format-patch` format (include commit metadata), use `git am` not `git apply`.

---

## Working Conventions

- Create a local working branch: `claude/{description}`
- Generate patches against the remote branch HEAD (not local commits)
- Push patches to vault `2y0tyre74nw684v09hf9ucx0:4xw8kugl` with token `owasp`
- Sequential naming: next patch would be `0015__*`
- Conductor confirms patch applied, pushes to GitHub, dev agent pulls to verify
