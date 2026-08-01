# vault/proposed — Sub-Vaults & External Resources

**Domain:** `vault/` | **Last updated:** 2026-06-30 | **Maintained by:** Librarian
**Source:** briefs 05/24–05/25

**Note:** Sub-vaults Phases 0–3 (P-159 to P-165 implementation) are EXISTS in `ui/index.md`
(Vault Browser UI → Sub-Vaults Phase 0–3). The items below represent the ORIGINAL proposals.
The P-numbers are preserved for corpus traceability.

Architecture briefing pack: `team/roles/architect/reviews/05/25/v0.27.62__briefing-pack__sub-vaults-and-external-resources.md`
Designer review: `team/roles/designer/reviews/05/25/v0.27.62__designer-review__sub-vaults-and-external-resources-ux.md`
Dev plan: `team/roles/dev/reviews/05/25/v0.27.62__implementation-plan__sub-vaults-and-external-resources.md`
User guide: `library/guides/content/v0.27.62__guide__vault-in-vaults.md`

---

## Sub-Vaults & External Resources via Convention Files (05/24–05/25 briefs)

Builds on EXISTING foundations: `.vault/owner/*` double-encryption (`vault-hkdf.js`), `SGVault.openReadOnly`
(`sg-vault.js:93`), `SGVault._loadTreeFromCommit` (`sg-vault.js:312`), `VaultLoader.openROToken`
(`vault-loader.js:122`), the `app.json`/`_page.json` convention mechanism, and lazy sub-tree loading.

| # | Feature | Status | One-Line Description | Source |
|---|---------|--------|---------------------|--------|
| P-159 | Link-file convention (`*.link.json`) | **EXISTS** (ui/index.md Phase 0) | Dumb, movable pointer file in the regular tree (no keys). `vault_id` + `ref_id` + optional overrides. | sub-vaults-workflow |
| P-160 | `ro-links.json` / `rw-links.json` in `.vault/owner/` | **EXISTS** (ui/index.md Phase 1) | Per-`ref_id` record holding canonical metadata + the key, split by power: `ro-links` (read_key-encrypted) vs `rw-links` (owner double-encrypted). | sub-vaults-workflow |
| P-161 | Inline sub-vault traversal (read-only in v1) | **EXISTS** (ui/index.md Phase 1–2) | Sub-vault renders as expandable folder, opens lazily on access, spliced inline; always read-only in v1. | sub-vaults-workflow |
| P-174 | Per-tab vault identity (multi-window) | **EXISTS** (`vault-loader-storage.js`) | Move vault key from shared `localStorage` to per-tab `sessionStorage`; enables multi-window independent sessions. | sub-vaults-workflow |
| P-162 | Link card (`<sg-link-card>`) | **EXISTS** (ui/index.md Phase 2) | Miniature open-vault surface: public info before key via `fetchPreview`, key prompt + save choice, "Open here" / "Open in new window". | conventions/workflow |
| P-163 | External-resource link types + per-type renderer (`<sg-embed-frame>`) | **EXISTS** (ui/index.md Phase 2) | `type` = `link`/`video`/`image`/`app`; rendering differs by type; default-deny click-to-load; sticky transparency banner. | conventions |
| P-164 | Opt-in app→vault access grant (v1, first-class) | PROPOSED — not yet built | Explicit owner grant of scoped read-only `requestFile` channel to a named folder; amber granted banner + Revoke. | conventions |
| P-165 | CLI clone-within-clone + write-inside-child | PROPOSED — not yet built | Nested clone resolution in `sgit`; commits/recursive write inside a sub-vault (Phase 4 deferred). | sub-vaults-workflow |
