# QA Team: Start Here

**Last updated:** 19 May 2026 | **Current state:** v0.4.0 (share + open trees) in repo; v0.3.2 on legacy user UI

---

## What This Page Is

This is the single entry point for the QA team when you clone this repo. It tells you what changed, what to test, and where to find the details.

---

## Current State: v0.4.0 Share + Open Trees (May 2026)

As of 14 May 2026, the UI has been split into two purpose-built IFD trees:

- **Share tree** (`sgraph_ai_app_send__ui__share/v0/v0.4/v0.4.0/`) — sender wizard (`/en-gb/share/`)
- **Open tree** (`sgraph_ai_app_send__ui__open/v0/v0.4/v0.4.0/`) — receiver routes (`/en-gb/open/...`)

The old `sgraph_ai_app_send__ui__user/` (v0.3.x) is **legacy** — retained for rollback, not yet deployed as primary.

**Vault Browser UI** is at **v0.2.3** (package `sgraph_ai_app_send__ui__vault/`).

---

## What Changed (Most Recent First)

| Date | Change | Summary |
|------|--------|---------|
| **15 May** | Vault UI v0.2.3 updates | App Mode loading overlay (`sg-app-ready` postMessage), Re-activate App Mode after auth, 'Remove from saved vaults' button, ↗ 'Open in new window' on vault cards |
| **14 May** | v0.4.0 Phase B complete | All v0.3.x overlays inlined into share + open trees; unified Done screen; ephemeral-by-default |
| **12 May** | v0.4.0 Phase A | Share + open tree scaffold; CI workflows `deploy-ui-share.yml` and `deploy-ui-open.yml` created |
| **09 May** | Vault UI v0.2.2 iframe fixes | data-URI inlining, single-iframe edit-mode, color-scheme:light, duplicate button removed |
| **08 May** | Vault UI v0.2.2 + v0.2.3 | `<sg-app-banner>` App Mode, HTML split-view editor, Token Test Harness dev page |
| **07–08 May** | User UI v0.3.2 | Share a Secret page, Options step (5-step wizard), Secret Tab UX, `<sg-vault-picker>` |
| **30 Mar** | User UI v0.3.1 | 16 browse view fixes; gallery folder rename |

---

## Architecture: IFD Overlay Chain

**All browser UIs use IFD methodology** — no build step, no bundler, surgical overlay scripts.
For v0.4.0, all overlays have been inlined (base tree is self-contained). No prototype patches.

**UI packages in this repo:**

| Package | Latest | Status |
|---------|--------|--------|
| `sgraph_ai_app_send__ui__share/` | v0.4.0 | ACTIVE — sender wizard |
| `sgraph_ai_app_send__ui__open/` | v0.4.0 | ACTIVE — receiver routes |
| `sgraph_ai_app_send__ui__vault/` | v0.2.3 | ACTIVE — vault browser UI |
| `sgraph_ai_app_send__ui__admin/` | v0.1.7 | ACTIVE — admin console |
| `sgraph_ai_app_send__ui__workspace/` | v0.1.0 | ACTIVE — LLM workspace |
| `sgraph_ai_app_send__ui__user/` | v0.3.2 | LEGACY — rollback only |

---

## Your Priority Right Now

For the **v0.4.0 share + open trees**, the key test areas are:

1. **5-step wizard (file mode):** Upload → Options → Confirm → Encrypt & Upload → Done. Verify ephemeral defaults (max_views=20, expires=7d) appear in Options step.
2. **5-step wizard (secret mode):** Secret tab (pill toggle), textarea, Views/Expires pills, "Review →". Verify ephemeral defaults (max_views=2, expires=24h). Verify Done screen shows kill link.
3. **Unified Done screen:** Both file and secret paths land on the same `<upload-step-done>` component with correct content for each mode.
4. **Kill link:** Shown on Done screen for both modes. Test kill flow (ephemeral delete).
5. **Open tree — receiver routes:** Browse, download, gallery, view, secret-view all load and decrypt correctly.
6. **Vault UI v0.2.3:** App Mode loading overlay (trigger `sg-app-ready` postMessage), Remove from saved vaults on error page, Open in new window on vault cards.

---

## Changelogs Since March (read in order)

| Date | Changelog | Summary |
|------|-----------|---------|
| 09 May | [`v0.27.18__changelog__vault-html-iframe-bugs.md`](changelog/05/09/v0.27.18__changelog__vault-html-iframe-bugs.md) | Vault UI v0.2.2 iframe fixes |
| 30 Mar | [`v0.20.4__changelog__v031-browse-view-overhaul.md`](changelog/03/30/v0.20.4__changelog__v031-browse-view-overhaul.md) | v0.3.1 — 16 browse fixes |
| 28 Mar | [`v0.19.5__changelog__v031-mvp-ifd-overlay-and-browse-fixes.md`](changelog/03/28/v0.19.5__changelog__v031-mvp-ifd-overlay-and-browse-fixes.md) | v0.3.1 first overlay |
| 23 Mar | [`v0.16.54__changelog__qa-change-requests-cr001-cr004.md`](changelog/03/23/v0.16.54__changelog__qa-change-requests-cr001-cr004.md) | `data-ready`, `data-testid` (100+), token counter API |
| 23 Mar | [`v0.16.50__changelog__two-column-download-layout-restored.md`](changelog/03/23/v0.16.50__changelog__two-column-download-layout-restored.md) | Two-column download layout restored |

---

## How This Folder Works

```
team/comms/
  QA_START_HERE.md          <-- You are here
  README.md                 <-- Full operating model for all teams
  changelog/MM/DD/          <-- What changed + expected test impact
  qa/briefs/MM/DD/          <-- What to test + action items FOR you
  qa/questions/MM/DD/       <-- Questions between Explorer <-> QA
  briefs/MM/DD/             <-- Inter-team briefs (Vault->Browse, etc.)
  plans/MM/DD/              <-- What's planned (pre-implementation)
```

Every UI change produces two documents:

1. **Changelog** — what changed, which files, expected test impact (good failures vs bad failures)
2. **QA Brief** — specific test cases, what to verify, what NOT to change

**Good failure** = test broke because the feature was intentionally changed. Update the test.
**Bad failure** = test broke but the feature wasn't changed. Report it as a bug.

---

## Version Detection

```javascript
// In Playwright or browser console:
const version = await page.evaluate(() => window.SGRAPH_BUILD?.uiVersion);
// v0.4.0 share tree: check for 'v0.4.0' or inspect Network tab for share/index.html
```

For v0.4.0: No overlay files in the Network tab (all inlined). The shell is a flat list
of `_common/js/...` scripts.

---

## Key Test Data Attributes

`data-testid` attributes (100+) across 7 pages exist since CR-003 (23 March). These were
in the v0.3.x user UI. Verify that v0.4.0 share/open trees preserve the same `data-testid`
attributes where the components are the same.

```javascript
await page.locator('[data-testid="access-gate-token-input"]').fill('test-token');
await page.locator('[data-testid="access-gate-submit"]').click();
```

---

## Structure Key Encryption Split (⚠️ Active Cross-Team Change)

An active architectural change (`vault/proposed/structure-key-split.md`) affects the vault
crypto layer. If you see vault tests related to key derivation or structure key handling,
consult the Architect and Vault team before writing new tests in this area.

---

## Related Resources

| Resource | Location |
|----------|----------|
| Reality document (what exists in code) | `team/roles/librarian/reality/index.md` |
| UI domain detail | `team/roles/librarian/reality/ui/index.md` |
| QA domain detail | `team/roles/librarian/reality/qa/index.md` |
| QA site | [qa.send.sgraph.ai](https://qa.send.sgraph.ai) |
| Product (live) | [send.sgraph.ai](https://send.sgraph.ai) |
| Dev environment | [dev.send.sgraph.ai](https://dev.send.sgraph.ai) |
