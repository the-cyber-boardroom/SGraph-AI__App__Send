# Technical Bootstrap Guide — Step by Step

**Version:** v0.5.29
**Date:** 22 Feb 2026
**Purpose:** Step-by-step instructions for setting up the QA project from scratch

---

## Prerequisites

- Python 3.12
- Poetry (dependency management)
- Node.js (for Playwright browser install)
- Git
- GitHub account with repo creation permissions

---

## Phase 1: Repo and Infrastructure (DO THIS FIRST)

**Goal:** Working repo, working CI, working docs deployment. No tests yet.

### Step 1.1: Create Repo Structure

```
SG-Send__QA/
├── .claude/
│   └── CLAUDE.md                ← Agent guidance (adapt from bootstrap pack)
├── .github/
│   └── workflows/
│       └── run-tests.yml        ← CI pipeline
├── config/
│   ├── test-config.json         ← Target URL, test parameters
│   └── .env.example             ← Environment variable template
├── sg_send_qa/                  ← Python code
│   └── utils/
│        └── Version.py          ← Provides version and first test target
├── tests/
│   ├── unit/                    ← tests for code in sg_send_qa
│   │   └── utils/
│   │        └── test_Version.py
│   ├── integration/                
│       ├── user/                ← User Lambda tests
│       └── admin/               ← Admin Lambda tests
├── docs/                        ← Generated markdown + screenshots
│   ├── screenshots/             ← Generated during test runs
│   └── index.md                 ← Documentation home page
├── pyproject.toml               ← Dependencies
├── requirements.txt             ← Pinned for CI
└── README.md
```

### Step 1.2: Dependencies

```toml
# pyproject.toml
[tool.poetry.dependencies]
python = "^3.12"
playwright = "^1.40"
fastapi = "^0.110"
uvicorn = "^0.27"
osbot-utils = "^3.0"
osbot-fast-api = "^2.0"
osbot-fast-api-serverless = "^1.0"
pillow = "^10.0"          # For screenshot comparison

[tool.poetry.group.dev.dependencies]
pytest = "^8.0"
pytest-asyncio = "^0.23"
```

### Step 1.3: Test Configuration

```json
// config/test-config.json
{
    "targets": {
        "local": {
            "user_url": "http://localhost:10062",
            "admin_url": "http://localhost:10061"
        },
        "production": {
            "user_url": "https://send.sgraph.ai",
            "admin_url": "https://admin.send.sgraph.ai"
        }
    },
    "screenshots": {
        "directory": "screenshots",
        "visual_diff_threshold": 0.01
    },
    "docs": {
        "output_directory": "docs",
        "template": "default"
    }
}
```

```bash
# config/.env.example
TEST_TARGET=local
TEST_ACCESS_TOKEN=your-test-token-here
ADMIN_API_KEY=your-admin-api-key-here
```

### Step 1.4: FastAPI Server Skeleton

```python
# server/main.py
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="SG/Send QA Test Runner")

@app.get("/info/health")
def health():
    return {"status": "ok", "service": "sg_send__qa"}

@app.post("/api/tests/run")
def run_all_tests():
    # TODO: Trigger test suite
    return {"status": "not_implemented"}

@app.post("/api/tests/run/{test_name}")
def run_test(test_name: str):
    # TODO: Trigger specific test
    return {"status": "not_implemented", "test": test_name}

@app.get("/api/tests/results")
def get_results():
    # TODO: Return test results
    return {"results": []}

@app.get("/api/docs")
def get_docs_index():
    # TODO: Return generated documentation index
    return {"pages": []}
```

### Step 1.5: CLI Skeleton

```python
#!/usr/bin/env python3
# cli/run_tests.py
import argparse
import subprocess
import sys

def main():
    parser = argparse.ArgumentParser(description="SG/Send QA Test Runner")
    parser.add_argument("--target", default="http://localhost:10062",
                        help="Target URL to test")
    parser.add_argument("--test", default=None,
                        help="Specific test to run (e.g., user.test_landing_page)")
    parser.add_argument("--generate-docs", action="store_true",
                        help="Generate markdown docs after tests")
    parser.add_argument("--docs-only", action="store_true",
                        help="Regenerate docs from existing screenshots")
    args = parser.parse_args()

    if args.docs_only:
        print("Regenerating documentation from existing screenshots...")
        # TODO: Implement doc generation
        return

    # Build pytest command
    cmd = ["python", "-m", "pytest", "tests/", "-v"]
    if args.test:
        cmd.extend(["-k", args.test])

    # Set target URL via environment
    import os
    os.environ["TEST_TARGET_URL"] = args.target

    result = subprocess.run(cmd)

    if args.generate_docs:
        print("Generating documentation...")
        # TODO: Implement doc generation

    sys.exit(result.returncode)

if __name__ == "__main__":
    main()
```

### Step 1.6: GitHub Actions Workflow

```yaml
# .github/workflows/run-tests.yml
name: Run QA Tests

on:
  push:
    branches: [main, dev]
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  run-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          npx playwright install --with-deps chromium

      - name: Run tests
        env:
          TEST_TARGET_URL: ${{ secrets.TEST_TARGET_URL || 'https://send.sgraph.ai' }}
          TEST_ACCESS_TOKEN: ${{ secrets.TEST_ACCESS_TOKEN }}
          ADMIN_API_KEY: ${{ secrets.ADMIN_API_KEY }}
        run: python cli/run_tests.py --target $TEST_TARGET_URL --generate-docs

      - name: Commit screenshot changes
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "Update QA screenshots and docs [skip ci]"
          file_pattern: "screenshots/ docs/"

  deploy-docs:
    needs: run-tests
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment:
      name: github-pages
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs/
      - uses: actions/deploy-pages@v4
```

### Step 1.7: Verify

Before moving to Phase 2, verify:

- [ ] `python server/main.py` starts and `/info/health` returns OK
- [ ] `python cli/run_tests.py --help` shows usage
- [ ] `git push` triggers GitHub Actions workflow
- [ ] GitHub Pages is configured and accessible

---

## Phase 2: Browser Automation Setup

**Goal:** A minimal test that opens a URL and captures a screenshot.

### Step 2.1: Install Playwright

```bash
pip install playwright
npx playwright install chromium
```

### Step 2.2: Pytest Fixtures

```python
# tests/conftest.py
import pytest
from playwright.sync_api import sync_playwright
import os
import json
from pathlib import Path

@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        yield browser
        browser.close()

@pytest.fixture
def page(browser):
    context = browser.new_context(viewport={"width": 1280, "height": 720})
    page = context.new_page()
    yield page
    context.close()

@pytest.fixture
def target_url():
    return os.environ.get("TEST_TARGET_URL", "http://localhost:10062")

@pytest.fixture
def screenshots(request):
    """Screenshot capture fixture with descriptions."""
    test_name = request.node.name.replace("test_", "")
    shots_dir = Path("screenshots") / test_name
    shots_dir.mkdir(parents=True, exist_ok=True)

    captured = []

    class ScreenshotCapture:
        def capture(self, page, name, description=""):
            path = shots_dir / f"{name}.png"
            page.screenshot(path=str(path), full_page=True)
            captured.append({
                "name": name,
                "path": str(path),
                "description": description
            })

        @property
        def all(self):
            return captured

    return ScreenshotCapture()
```

### Step 2.3: First Minimal Test

```python
# tests/user/test_landing_page.py
def test_landing_page_loads(page, target_url, screenshots):
    """Navigate to SG/Send and verify the landing page loads."""
    page.goto(f"{target_url}/send/")
    page.wait_for_load_state("networkidle")

    screenshots.capture(page, "01_landing",
        description="Navigate to the SG/Send landing page")

    # Basic assertion: page has loaded
    assert page.title() or page.url
```

### Step 2.4: Verify

```bash
# Run the minimal test
TEST_TARGET_URL=https://send.sgraph.ai python -m pytest tests/user/test_landing_page.py -v

# Check: screenshot captured?
ls screenshots/landing_page_loads/
# Should show: 01_landing.png
```

---

## Phase 3: The Smoke Test (User Lambda)

**Goal:** Full user flow with 4 screenshots and assertions.

See `02_mission-brief.md` for the detailed test flow and expected screenshots.

Implementation outline:

```python
# tests/user/test_user_smoke.py
def test_user_smoke(page, target_url, screenshots):
    # Step 1: Landing page
    page.goto(f"{target_url}/send/")
    page.wait_for_load_state("networkidle")
    screenshots.capture(page, "01_landing",
        description="The SG/Send landing page with Beta Access gate")
    assert page.locator("text=Beta Access").is_visible()
    assert page.locator("input[placeholder='Paste your access token']").is_visible()

    # Step 2: Enter invalid token
    page.fill("input[placeholder='Paste your access token']", "an token")
    screenshots.capture(page, "02_token_entered",
        description="An invalid token entered in the access field")

    # Step 3: Click Go, expect error
    page.click("button:has-text('Go')")
    page.wait_for_selector("text=Token not found", timeout=5000)
    screenshots.capture(page, "03_token_rejected",
        description="Invalid token rejected with error message")
    assert page.locator("text=Token not found").is_visible()

    # Step 4: Enter valid token
    page.fill("input[placeholder='Paste your access token']", "")
    import os
    valid_token = os.environ.get("TEST_ACCESS_TOKEN", "")
    if valid_token:
        page.fill("input[placeholder='Paste your access token']", valid_token)
        page.click("button:has-text('Go')")
        page.wait_for_selector("text=Drop your file here", timeout=10000)
        screenshots.capture(page, "04_upload_page",
            description="Valid token accepted — file upload interface loaded")
        assert page.locator("text=Drop your file here").is_visible()
        assert page.locator("text=uses remaining").is_visible()
```

---

## Phase 4: Documentation Generation

**Goal:** Markdown pages generated from test screenshots.

```python
# cli/generate_docs.py
from pathlib import Path
import json

def generate_docs():
    screenshots_dir = Path("screenshots")
    docs_dir = Path("docs")
    docs_dir.mkdir(exist_ok=True)

    index_entries = []

    for test_dir in sorted(screenshots_dir.iterdir()):
        if not test_dir.is_dir():
            continue

        test_name = test_dir.name
        shots = sorted(test_dir.glob("*.png"))

        if not shots:
            continue

        # Generate markdown page
        md = f"# {test_name.replace('_', ' ').title()}\n\n"
        for shot in shots:
            desc = shot.stem.replace("_", " ").title()
            relative_path = f"../screenshots/{test_name}/{shot.name}"
            md += f"## {desc}\n\n"
            md += f"![{desc}]({relative_path})\n\n"

        doc_path = docs_dir / f"{test_name}.md"
        doc_path.write_text(md)
        index_entries.append((test_name, f"{test_name}.md"))

    # Generate index
    index_md = "# SG/Send QA Documentation\n\n"
    index_md += "Generated from automated browser tests.\n\n"
    for name, path in index_entries:
        index_md += f"- [{name.replace('_', ' ').title()}]({path})\n"

    (docs_dir / "index.md").write_text(index_md)

if __name__ == "__main__":
    generate_docs()
```

---

## Phase 5: Dogfooding

**Goal:** Test your own documentation site with your own test infrastructure.

```python
# tests/meta/test_docs_site.py
def test_docs_site_renders(page, screenshots):
    """Verify the QA docs site renders correctly."""
    page.goto("https://your-gh-pages-url.github.io/sg_send__qa/")
    page.wait_for_load_state("networkidle")

    screenshots.capture(page, "01_docs_index",
        description="The QA documentation site renders correctly")

    assert page.locator("h1").is_visible()
```

---

## Related Research

Before making tool decisions, review the Architect's browser automation evaluation:

- **Tool evaluation:** [`team/roles/architect/reviews/02/22/v0.5.29__research__browser-automation-tool-evaluation.md`](../../../../team/roles/architect/reviews/02/22/v0.5.29__research__browser-automation-tool-evaluation.md) — Playwright vs Vercel agent-browser. Recommendation: start with Playwright (Phase 1-3 above), add agent-browser in Phase 2+ for visual diffing, annotated screenshots, and video recording.
- **Dev feasibility review:** [`team/roles/dev/reviews/02/22/v0.5.29__review__qa-project-bootstrap-pack.md`](../../../../team/roles/dev/reviews/02/22/v0.5.29__review__qa-project-bootstrap-pack.md) — Stack decisions, timeline, risks.

---

*QA Bootstrap Pack — Technical Bootstrap Guide — v0.5.29*
