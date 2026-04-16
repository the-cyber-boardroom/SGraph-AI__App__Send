# QA Team: Start Here

**Last updated:** 30 March 2026 | **Current UI version:** v0.3.1 (IFD overlay on v0.3.0)

---

## What This Page Is

This is the single entry point for the QA team when you clone this repo. It tells you what changed, what to test, and where to find the details.

---

## Current State: v0.3.1 Live

v0.3.1 is an IFD overlay on v0.3.0 production. **Only the browse view** (`/en-gb/browse/`) has patches. All other pages are unchanged v0.3.0.

**16 fixes shipped** in 5 overlay files with zero modifications to v0.3.0 code.

---

## What Changed (Most Recent First)

Read the changelogs in order. Each one tells you what broke and what should still pass.

| Date | Changelog | QA Brief | Summary |
|------|-----------|----------|---------|
| **30 Mar** | [v0.3.1 Browse Overhaul (16 fixes)](changelog/03/30/v0.20.4__changelog__v031-browse-view-overhaul.md) | [**v0.3.1 Final Checks**](qa/briefs/03/30/v0.20.4__qa-brief__v031-final-checks-before-go-live.md) | 16 browse view fixes, gallery folder rename. **HIGH priority — final validation.** |
| 28 Mar | [v0.3.1 MVP IFD Overlay](changelog/03/28/v0.19.5__changelog__v031-mvp-ifd-overlay-and-browse-fixes.md) | [Browse bug fixes](qa/briefs/03/28/v0.19.5__qa-brief__v031-browse-view-bug-fixes.md) | First v0.3.1 overlay: folder basenames + PDF Present mode |
| 23 Mar | [QA Change Requests CR-001–004](changelog/03/23/v0.16.54__changelog__qa-change-requests-cr001-cr004.md) | [Token counter zero-state](qa/briefs/03/23/v0.16.54__qa-brief__token-counter-zero-state.md) | `data-ready` signal, `data-testid` attributes (100+ elements), token counter API contract |
| 23 Mar | [Two-column download layout](changelog/03/23/v0.16.50__changelog__two-column-download-layout-restored.md) | [Download layout update](qa/briefs/03/23/v0.16.50__qa-brief__download-layout-test-update.md) | Single-file download restored to two-column layout |

---

## Your Priority Right Now

**Read this QA brief first:**
[v0.20.4__qa-brief__v031-final-checks-before-go-live.md](qa/briefs/03/30/v0.20.4__qa-brief__v031-final-checks-before-go-live.md)

It contains:
- 16 test cases with checkboxes (BRW-001 through BRW-015 + gallery rename + regressions)
- Version detection instructions (footer, `window.SGRAPH_BUILD`, Network tab)
- A suggested test zip structure for comprehensive testing
- Rollback plan
- Security checks (HTML iframe isolation)

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

### The Pattern: Changelog + QA Brief = Test Update

Every UI change produces **two documents**:

1. **Changelog** — what changed, which files, expected test impact (good failures vs bad failures)
2. **QA Brief** — specific test cases, what to verify, what NOT to change

**Good failure** = test broke because the feature was intentionally changed. Update the test.
**Bad failure** = test broke but the feature wasn't changed. Report it as a bug.

---

## Version Detection

### How to confirm which version is running

```javascript
// In Playwright or browser console:
const version = await page.evaluate(() => window.SGRAPH_BUILD?.uiVersion);
// Expected: 'v0.3.1' on upload and browse pages
```

### v0.3.1 overlay files (should appear in Network tab)

| File | Loaded on | What it patches |
|------|-----------|-----------------|
| `send-browse-v031.js` | Browse pages | 12 browse fixes |
| `send-browse-v031.css` | Browse pages | Link color, styling |
| `markdown-parser-v031.js` | Browse pages | Image rendering, bare links |
| `send-gallery-v031.js` | Browse pages | Gallery folder naming |
| `upload-folder-v031.js` | Upload page | Gallery folder naming |

If any overlay returns 404, the page falls back to v0.3.0 behaviour (no crash).

---

## Pages Affected by v0.3.1

| Page | v0.3.1 patches? | What changed |
|------|-----------------|-------------|
| `/en-gb/` (upload) | Minimal — gallery folder rename only | `upload-folder-v031.js` |
| `/en-gb/browse/` | **All 16 fixes** | 5 overlay files |
| `/en-gb/gallery/` | No patches | Still v0.3.0 |
| `/en-gb/download/` | No patches | Still v0.3.0 |
| All other pages | No patches | Still v0.3.0 |

---

## Key Test Data Attributes

Since CR-003 (23 March), 100+ `data-testid` attributes are available across 7 pages. Additionally, 14 `data-qa-mask` attributes exist for screenshot determinism.

Use `data-testid` selectors for robust tests:
```javascript
await page.locator('[data-testid="access-gate-token-input"]').fill('test-token');
await page.locator('[data-testid="access-gate-submit"]').click();
```

Use `data-qa-mask` for screenshot masking:
```javascript
const masks = await page.locator('[data-qa-mask]').all();
```

---

## Related Resources

| Resource | Location |
|----------|----------|
| Reality document (what exists in code) | `team/roles/librarian/reality/v0.16.26__what-exists-today.md` |
| v0.3.0 QA triage (66 issues, 17 fixed) | `team/humans/dinis_cruz/debriefs/03/27/v0.17.2__debrief__v030-qa-triage-17-fixes.md` |
| QA site | [qa.send.sgraph.ai](https://qa.send.sgraph.ai) |
| Product (live) | [send.sgraph.ai](https://send.sgraph.ai) |
| Dev environment | [dev.send.sgraph.ai](https://dev.send.sgraph.ai) |
