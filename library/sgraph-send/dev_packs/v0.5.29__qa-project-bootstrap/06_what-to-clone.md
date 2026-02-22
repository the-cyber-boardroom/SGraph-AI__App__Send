# What to Clone — Read-Only Access List

**Version:** v0.5.29
**Date:** 22 Feb 2026
**Purpose:** Specific files/directories the QA project should reference from the main SG/Send repo

---

## Clone the Main Repo (Read-Only)

```bash
git clone --depth 1 https://github.com/SGraph-AI/App__Send.git sgraph-send-reference
```

This is a **read-only reference**. The QA project never pushes to this repo.

---

## What to Reference

### Architecture and Patterns (Read, Don't Copy)

| What | Path in Main Repo | Why You Need It |
|---|---|---|
| Project CLAUDE.md | `.claude/CLAUDE.md` | Stack rules, architecture principles, naming conventions |
| IFD guide | `library/guides/development/ifd/v1.2.1__ifd__intro-and-how-to-use.md` | If building IFD web components for the test runner UI |
| FastAPI server pattern | `sgraph_ai_app_send/lambda__admin/fast_api/Fast_API__SGraph__App__Send__Admin.py` | Pattern for the QA test runner FastAPI server |
| Route pattern | `sgraph_ai_app_send/lambda__admin/fast_api/routes/Routes__Tokens.py` | How to structure route classes |
| Deploy pattern | `sgraph_ai_app_send/lambda__admin/lambda_function/deploy/Deploy__Service.py` | Pattern for Lambda deployment |
| Test setup pattern | `tests/unit/lambda__admin/Fast_API__Test_Objs__SGraph__App__Send__Admin.py` | How to set up TestClient for self-tests |
| CI pipeline | `.github/workflows/ci-pipeline.yml` | Pattern for GitHub Actions |
| Local dev scripts | `scripts/admin__run-locally.sh` | Pattern for local server scripts |

### Understanding the Test Targets (Read, Don't Copy)

| What | Path in Main Repo | Why You Need It |
|---|---|---|
| User Lambda app | `sgraph_ai_app_send/lambda__user/fast_api/Fast_API__SGraph__App__Send__User.py` | Understand routes and auth flow |
| User Lambda routes | `sgraph_ai_app_send/lambda__user/fast_api/routes/Routes__Transfers.py` | Token validation logic |
| Admin Lambda app | `sgraph_ai_app_send/lambda__admin/fast_api/Fast_API__SGraph__App__Send__Admin.py` | Admin auth, route registration |
| Admin config | `sgraph_ai_app_send/lambda__admin/admin__config.py` | UI version config, env vars |

### Understanding the UI (Read for Selector Knowledge)

| What | Path in Main Repo | Why You Need It |
|---|---|---|
| User UI landing page | `sgraph_ai_app_send__ui__user/v0/v0.1/v0.1.6/index.html` | HTML structure, element IDs/classes for test selectors |
| Access gate component | `sgraph_ai_app_send__ui__user/v0/v0.1/v0.1.4/components/send-access-gate/` | Token input flow, error display |
| Upload component | `sgraph_ai_app_send__ui__user/v0/v0.1/v0.1.4/components/send-upload/` | Upload interface structure |
| Download page | `sgraph_ai_app_send__ui__user/v0/v0.1/v0.1.6/download.html` | Download + decrypt flow |
| Admin UI index | `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.5/index.html` | Admin shell structure, component loading |
| Admin shell | `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.3/components/admin-shell/` | Navigation, layout |
| Admin API client | `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.0/js/admin-api.js` | How admin auth works in the browser |

### Adapt for QA Project (Copy and Modify)

| What | Path in Main Repo | What to Adapt |
|---|---|---|
| EventBus | `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.3/services/event-bus.js` | Reuse for test runner UI messaging |
| Messages panel | `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.3/components/messages-panel/` | Reuse for test runner status display |
| API logger | `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.6/components/api-logger/` | Reuse for test API call logging |
| CSS variables | `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.0/css/admin.css` | Dark theme, brand colours |
| Brand mark | `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.4/css/sg-brand.css` | SG/ branding |

### Role Definitions (Reference for Format)

| What | Path in Main Repo | Why You Need It |
|---|---|---|
| Role format example | `team/roles/ambassador/ROLE.md` | Format template for QA role definitions |
| QA role (main) | `team/roles/qa/ROLE.md` | Reference for QA practices |
| Librarian role (main) | `team/roles/librarian/ROLE.md` | Reference for documentation practices |

---

## What NOT to Clone/Copy

| Do NOT Copy | Why |
|---|---|
| `team/humans/dinis_cruz/briefs/` | Human-only folder. Read-only even in the main repo. |
| `sgraph_ai_app_send/` (application code) | You test the running app, you don't need the source in your repo |
| `tests/unit/` (main project tests) | Different test type. Reference the pattern, don't copy the tests. |
| `node_modules/`, `__pycache__/`, `.venv/` | Generated files. Never copy. |
| `.local-server.env` | Contains secrets. Never copy. |

---

## Reference Screenshots

The human provided 4 reference screenshots of the user lambda flow. These are in the main repo at:

```
team/humans/dinis_cruz/briefs/02/22/new-qa-project/
├── qa-reference__user_01_landing.png
├── qa-reference__user_02_token_entered.png
├── qa-reference__user_03_token_rejected.png
└── qa-reference__user_04_upload_page.png
```

These show the expected visual state at each step of the user smoke test. Your browser automation screenshots should match these.

---

*QA Bootstrap Pack — What to Clone — v0.5.29*
