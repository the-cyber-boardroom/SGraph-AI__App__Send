# QA Project — Mission Brief

**Version:** v0.5.29
**Date:** 22 Feb 2026
**Project:** SG/Send QA Automation
**Type:** Standalone project (separate repo from SG/Send)

---

## Mission

Build a **browser automation test suite** that simultaneously:

1. **Validates the UI works** — automated browser tests that catch bugs only visible in a real browser
2. **Generates living documentation** — screenshots taken during test runs become the images in markdown docs

Every test run produces **two outputs**: a pass/fail result AND a documentation page with screenshots.

---

## Scope

### What This Project Does

- Tests the SG/Send user interface via headless browser automation
- Captures screenshots at each step of every test
- Generates markdown documentation from screenshots
- Publishes documentation to GitHub Pages
- Provides API + CLI + web UI for triggering tests
- Runs in GitHub Actions, locally, and eventually Lambda

### What This Project Does NOT Do

- Modify SG/Send code (you test it, you don't change it)
- Replace SG/Send's existing unit tests (those test the backend; you test the UI)
- Store any secrets or user data (you use test tokens only)
- Run in production environments (you test against them, you don't deploy to them)

---

## Test Targets

### Target 1: User Lambda (START HERE)

The public-facing site at `https://send.sgraph.ai/`. This is the simpler test surface and the core product experience.

**Primary smoke test flow:**

| Step | Action | Expected Result | Screenshot |
|---|---|---|---|
| 1 | Navigate to `send.sgraph.ai` | Landing page loads: "Beta Access" heading, lock icon, token input | `user_01_landing.png` |
| 2 | Enter invalid token "an token" | Token text appears in input field | `user_02_token_entered.png` |
| 3 | Click [Go] | Red error: "Token not found. Please check and try again." | `user_03_token_rejected.png` |
| 4 | Enter valid token, click [Go] | Upload interface: File/Text tabs, drop zone, usage counter, [Change Token] | `user_04_upload_page.png` |

### Target 2: Admin Panel (AFTER user smoke test works)

The admin interface at `send.sgraph.ai/admin/`. Key pages to test:

| Page | Key Test Scenarios |
|---|---|
| Admin home | Valid token → dashboard. Invalid token → error. |
| PKI | Generate key pair, export, encrypt/decrypt cycle |
| Key Lookup | Search by code, import key |
| Key Registry | List published keys |
| Vault | Create vault, upload file, navigate folders |
| System Info | Version displayed, services listed |

---

## Deliverables

| # | Deliverable | Description |
|---|---|---|
| 1 | **Test suite** | Browser automation tests for user + admin flows |
| 2 | **Screenshot library** | Captured at each test step, committed only when visually changed |
| 3 | **Markdown documentation** | Generated from screenshots + test descriptions |
| 4 | **GitHub Pages site** | Published documentation, always up to date |
| 5 | **FastAPI test runner** | API for triggering tests, viewing results, browsing docs |
| 6 | **CLI** | Same capabilities as API, for terminal use |
| 7 | **CI pipeline** | GitHub Actions workflow: run tests, generate docs, deploy |

---

## Success Criteria

### After First Session

- [ ] Repo created with correct structure
- [ ] FastAPI server skeleton running locally
- [ ] CLI skeleton that can trigger a test
- [ ] GitHub Actions workflow that runs on push
- [ ] At least one browser test that opens `send.sgraph.ai` and takes a screenshot
- [ ] A markdown page generated from that screenshot
- [ ] GitHub Pages site showing the generated documentation

### After First Week

- [ ] Full user lambda smoke test (4 screenshots, assertions pass)
- [ ] Documentation page for smoke test live on GitHub Pages
- [ ] Visual diff logic preventing unnecessary screenshot commits
- [ ] Admin panel smoke test started
- [ ] Lambda deployment working

---

## What Success Looks Like

```
Developer pushes a UI change to SG/Send
    ↓
CI triggers QA project tests
    ↓
Browser automation runs all tests
    ↓
Screenshots captured at each step
    ↓
Visual diff: only changed screenshots committed
    ↓
Markdown docs regenerated
    ↓
GitHub Pages updated
    ↓
Documentation shows exactly what the UI looks like NOW
    ↓
No manual documentation effort. No stale screenshots. No drift.
```

---

## Related Research

- **Browser automation tool evaluation** — Architect compared Playwright (Python-native, mature) vs Vercel agent-browser (built-in visual diff, annotated screenshots, video recording). Recommendation: Playwright for scripted tests, agent-browser as complementary tool for visual diff and AI-driven exploratory testing.
  See: [`team/roles/architect/reviews/02/22/v0.5.29__research__browser-automation-tool-evaluation.md`](../../../../team/roles/architect/reviews/02/22/v0.5.29__research__browser-automation-tool-evaluation.md)

- **Feasibility and technical decisions** — Dev review covering stack decisions, estimated timeline, and identified risks.
  See: [`team/roles/dev/reviews/26-02-22/v0.5.29__review__qa-project-bootstrap-pack.md`](../../../../team/roles/dev/reviews/26-02-22/v0.5.29__review__qa-project-bootstrap-pack.md)

---

*QA Bootstrap Pack — Mission Brief — v0.5.29*
