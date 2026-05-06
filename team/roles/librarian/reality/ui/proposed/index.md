# ui/proposed — Index

**Domain:** `ui/` | **Last updated:** 2026-04-28
**Source:** Archived monolith `../v0.16.26__what-exists-today.md` — Sections 16 (lines 1210–1219, 1234–1241), 17 (lines 1541–1551), 29–30 (lines 2720–2830)

---

## Upload UX Redesign (v0.16.10 — 03/16)

| Proposed Feature | Status |
|-----------------|--------|
| Three-step upload flow (upload → distribution → credentials) | PROPOSED — ASCII mockups exist |
| Three sharing modes (simple token, full link, separate key) | PROPOSED |
| Simple token (PBKDF2-derived, client-side, no backend) | PROPOSED |
| 10GB upload limit (remove 5MB JS limit) | PROPOSED |
| Upload progress carousel with trust-building messages | PROPOSED |
| Demo packs with leaked keys on website | PROPOSED |

---

## Gallery Editor + Rich Preview (v0.16.17–v0.16.26)

| Proposed Feature | Status |
|-----------------|--------|
| Gallery editor (per-image comments, multi-language, layout) | PROPOSED |
| Rich preview (sender-side thumbnails, `_preview/` folder) | PROPOSED |
| Gallery download as self-contained HTML | PROPOSED |

---

## v0.3.0 Deferred Issues (47 items — post-launch backlog)

47 issues deferred from the v0.3.0 launch. Listed in monolith Section 17 (lines 1468–1479).
Not enumerated individually here — see archived monolith for full list. Status: BACKLOG.

---

## v0.3.1 IFD Overlay Additions (v0.19.5 — 03/28)

v0.3.1 shipped. These items were in the brief but NOT yet delivered:

| Proposed Feature | Status |
|-----------------|--------|
| Room Join page migrated to v0.3.0 IFD | PROPOSED — still at v0.2.x base |
| Room View page migrated to v0.3.0 IFD | PROPOSED — still at v0.2.x base |
| Vault page migrated to v0.3.0 IFD | PROPOSED — still at v0.2.x base |

---

## Vault Upload Beta in Main SG/Send UI (04/16 — doc 281)

Integrate vault-push mode into the main upload wizard as a beta feature. User can choose
"Send to vault" as a delivery mode. PROPOSED.

---

## `<sg-vault-picker>` Component (04/19 — doc 297)

A Web Component for selecting a vault (enter key, browse recent, create new). Used as a
building block for vault-integrated upload and other vault-aware workflows. PROPOSED.

---

## Pure View Mode (04/13 — docs 259 + 261)

Minimal view mode: strips all UI chrome, shows only the file content. For embedding in
iframes or sharing as a "clean view" link. PROPOSED.

---

## Embeddable Components in `_page.json` (04/13 — doc 259)

Allow `_page.json` to reference embeddable components (charts, interactive widgets, video
players) that render inline in the browse/view modes. PROPOSED.

*Full source: `../v0.16.26__what-exists-today.md` Sections 16–17, 29–30 (lines 1210–1551, 2720–2830)*
