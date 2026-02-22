# First Session Brief: QA Project Bootstrap

**Version:** v0.5.29
**Date:** 22 Feb 2026
**From:** Human (project lead)
**To:** New Claude Code session (QA project)
**Type:** Bootstrap brief — read this first

---

## Welcome

You are starting a new project. This is a **QA and documentation automation project** for SG/Send, an encrypted communication platform. You are NOT working on SG/Send itself — you are building the testing and documentation infrastructure that validates SG/Send works correctly.

This is a separate repo, a separate team, a separate concern. You consume SG/Send as a running service. You test it. You document it. You don't modify it.

---

## Read These Documents In Order

| # | Document | What It Tells You |
|---|---|---|
| 1 | This file (`07_first-session-brief.md`) | What to do right now |
| 2 | `01_project-context.md` | What SG/Send is, how it works, what you're testing |
| 3 | `02_mission-brief.md` | Your mission, scope, deliverables, success criteria |
| 4 | `03_role-definitions/` | Your 6 roles and their responsibilities |
| 5 | `04_practices-reference.md` | Pointers to the main repo for practices and conventions |
| 6 | `05_technical-bootstrap-guide.md` | Step-by-step setup instructions |
| 7 | `06_what-to-clone.md` | What to reference from the main SG/Send repo |

---

## Your Mission (Summary)

Build a browser automation test suite that:

1. **Runs automated browser tests** against SG/Send's user and admin interfaces
2. **Captures screenshots** at each step
3. **Generates markdown documentation** from those screenshots
4. **Publishes documentation** to GitHub Pages
5. **Runs everywhere** — CLI, FastAPI API, GitHub Actions, eventually Lambda

Every test run produces two outputs: a **pass/fail result** AND a **documentation page with screenshots**.

---

## Your Team

Six roles, not nineteen. Read `03_role-definitions/`.

| Role | One-Line Focus |
|---|---|
| **QA Lead** | Test design and quality gates |
| **Developer** | Browser automation code, test runner, CLI |
| **Architect** | Tool evaluation, execution environments |
| **DevOps** | CI pipeline, GitHub Pages, Lambda deployment |
| **Sherpa** | Documentation text quality |
| **Librarian** | Documentation structure and organisation |

---

## What You're Testing

### Target 1: User Lambda (START HERE)

The public site at `https://send.sgraph.ai/`. The first smoke test exercises this exact flow:

| Step | Action | Expected |
|---|---|---|
| 1 | Navigate to site | "Beta Access" heading, token input, [Go] button |
| 2 | Enter invalid token | Token in input field |
| 3 | Click [Go] | Red error: "Token not found. Please check and try again." |
| 4 | Enter valid token, click [Go] | File upload interface with drag-drop zone |

### Target 2: Admin Panel (AFTER user smoke test works)

The admin interface with token management, PKI, vault, and more.

---

## Phase Plan: Pipeline Before Tests

**Do not write any browser tests until the infrastructure is working.** The order matters:

### Phase 1: Repo and Pipeline (DO THIS FIRST)

- Create repo structure (`tests/`, `screenshots/`, `docs/`, `server/`, `cli/`)
- Create CLAUDE.md with role definitions and project context
- Create FastAPI server skeleton (`POST /api/tests/run`, `GET /api/tests/results`)
- Create CLI skeleton (`python cli/run_tests.py`)
- Set up GitHub Actions workflow
- Set up GitHub Pages for generated documentation
- **VERIFY:** push to repo works, API responds, CLI runs, GH Pages deploys

### Phase 2: Browser Automation Setup

- Install Playwright (`pip install playwright`, `npx playwright install chromium`)
- Evaluate Vercel Agent Browser as alternative (human's preferred tool)
- Create a minimal test: open a URL, take a screenshot, save it
- **VERIFY:** screenshot captured and saved

### Phase 3: The Smoke Test

- Implement the 4-step user flow described above
- Assert expected elements at each step
- Capture screenshots with descriptions
- Generate markdown page from screenshots
- **VERIFY:** documentation page generated with correct screenshots

### Phase 4: Dogfooding

- Test your own GitHub Pages site with your own test infrastructure
- **VERIFY:** the QA docs site renders correctly (tested by itself)

### Phase 5: Expand Coverage

- Admin panel tests
- Each test generates its own documentation page
- Build the docs index page
- Set up scheduled runs

---

## Key Technical Decisions (Already Made)

| Decision | Answer |
|---|---|
| Browser tool | Start with Playwright (guaranteed to work). Evaluate Vercel Agent Browser in parallel. |
| Screenshot format | PNG, 1280x720 viewport |
| Visual diff threshold | 1% pixel difference (ignore rendering noise) |
| Test framework | pytest with Playwright fixtures |
| Server framework | FastAPI via `osbot-fast-api-serverless` (same pattern as main project) |
| Documentation format | Markdown with relative image paths |
| Docs hosting | GitHub Pages |
| Secrets | GitHub Actions secrets (never in repo) |

---

## Key Principle

**API-first.** Everything must be triggerable via API AND CLI. The web UI is a convenience layer on top of the API.

```bash
# CLI
python cli/run_tests.py --test user.test_landing_page --target https://send.sgraph.ai

# API (same action)
curl -X POST https://qa-api.send.sgraph.ai/api/tests/run/user.test_landing_page
```

---

## Success Metrics: After This Session

- [ ] Repo created with correct structure
- [ ] FastAPI server skeleton running locally
- [ ] CLI skeleton that can trigger a test
- [ ] GitHub Actions workflow that runs on push
- [ ] At least one browser test that opens `send.sgraph.ai` and takes a screenshot
- [ ] A markdown page generated from that screenshot
- [ ] GitHub Pages site showing the generated documentation

---

## What NOT to Do

- **Don't modify SG/Send code.** You test it, you don't change it.
- **Don't copy the full practices library.** Reference the main repo.
- **Don't write tests before the pipeline works.** Infrastructure first.
- **Don't create 19 roles.** You have six. That's enough.
- **Don't store screenshots that haven't changed.** Visual diff before committing.

---

*QA Bootstrap Pack — First Session Brief — v0.5.29*
