# Tools — Proposed: Video Editing

**Domain:** tools/proposed/ | **Last updated:** 2026-07-20 | **Maintained by:** Librarian (daily run)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

---

## sg-tree Generic Tree-View Web Component (03/29 — Architect brief)

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| `<sg-tree>` custom element — read-only tree view (Shadow DOM, zero deps) | v0.19.11 architect brief 03/29 | PROPOSED |
| 12 public methods: setData, getData, getSelectedId, select, expand, collapse, expandAll, collapseAll, expandPath, scrollTo, filter, getExpandedIds/setExpandedIds | v0.19.11 architect brief 03/29 | PROPOSED |
| sg-tree-events.js event constants (select, expand, collapse, toggle, context-menu) | v0.19.11 architect brief 03/29 | PROPOSED |
| 17 CSS custom properties for theming (shadow boundary-piercing) | v0.19.11 architect brief 03/29 | PROPOSED |
| Adapter pattern — send-browse/vault-tree-view/vault-panel each write 10–30 line adapter | v0.19.11 architect brief 03/29 | PROPOSED |
| sg-tree v0.1.1 — edit mode (rename, move, delete, add) | v0.19.11 architect brief 03/29 | PROPOSED (future phase) |
| sg-tree v0.2.0 — virtual scrolling for large trees (1,000+ nodes) | v0.19.11 architect brief 03/29 | PROPOSED (future phase) |
| Hosting at tools.sgraph.ai/core/sg-tree/v0/v0.1/v0.1.0/ | v0.19.11 architect brief 03/29 | PROPOSED |

---

## Video Editor Expansion (03/29 — dev brief)

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| Multiple timeline tracks (video, audio, captions, masks) | v0.19.7 dev brief 03/29 | PROPOSED |
| Caption support — timestamps, positioning, SRT/VTT import/export | v0.19.7 dev brief 03/29 | PROPOSED |
| Masking with keyframes (blur/blackout, interpolated position for moving camera) | v0.19.7 dev brief 03/29 | PROPOSED |
| Non-destructive JSON transformation model (`type`, `params`, `applied_at`) | v0.19.7 dev brief 03/29 | PROPOSED |
| Undo/redo via transformation history (append-only, truncate on branch) | v0.19.7 dev brief 03/29 | PROPOSED |
| LLM integration — screenshot-based analysis, automatic captioning, mask suggestions | v0.19.7 dev brief 03/29 | PROPOSED |
| `sg-local-storage` Web Component — IndexedDB persistence, capacity management, viewer | v0.19.7 dev brief 03/29 | PROPOSED (reusable across tools) |
| Asset registry with SG/Send friendly token integration | v0.19.7 dev brief 03/29 | PROPOSED |
| Export: render final video with all transformations (client-side FFmpeg WASM) | v0.19.7 dev brief 03/29 | PROPOSED |
| Revenue: LLM token 25% markup + SG/Send credits for asset transfers | v0.19.7 dev brief 03/29 | PROPOSED (business model) |

---

## Video Crop/Overlay/Capture Tools (Section 30)

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| Video crop tool (browser-based, FFmpeg WASM) | Section 30 (docs 299–311) | PROPOSED |
| Video overlay tool (PiP, watermark, subtitle embed) | Section 30 (docs 299–311) | PROPOSED |
| Video capture tool (separate from the Video Recorder) | Section 30 (docs 299–311) | PROPOSED |

---

## Video Playback Component (Section 23)

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| Video Playback Component — playback of recorded/uploaded video | Section 23 (docs 235–251) | PROPOSED |
| Controls: play/pause, seek, speed control, fullscreen | Section 23 (docs 235–251) | PROPOSED |

---

## Video Generation (Section 23)

| Proposed Feature | Source | Status |
|-----------------|--------|--------|
| AI-assisted video generation tool | Section 23 (docs 235–251) | PROPOSED |
| Input: prompt + optional reference images | Section 23 (docs 235–251) | PROPOSED |
| Output: rendered video clip (no local model — API-based) | Section 23 (docs 235–251) | PROPOSED |
