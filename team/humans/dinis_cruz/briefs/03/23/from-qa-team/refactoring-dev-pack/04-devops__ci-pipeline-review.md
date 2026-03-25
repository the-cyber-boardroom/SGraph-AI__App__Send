<!-- Brief Pack Document 04 of 05 | See INDEX.md for navigation -->

# DevOps Review — CI Pipeline Architecture

**Role:** DevOps
**Version:** v0.2.14 (QA repo)
**Date:** 23 March 2026
**Type:** Review + proposed redesign
**Principle:** Pipeline is product. Fast feedback. Reproducible.

---

## 1. Current State — What Exists

4 workflow files, 408 total lines:

```
    FILE                              LINES  TRIGGER                    PURPOSE
    ─────────────────────────────────────────────────────────────────────────────
    ci-pipeline.yml                    147   workflow_call only          Base reusable workflow
    ci-pipeline__dev.yml                16   push to dev + dispatch     Triggers base for dev
    ci-pipeline__main.yml               16   push to main + dispatch    Triggers base for main
    qa-acceptance-tests.yml            229   push to feature branches   P0/P1/P2-P3 gate
                                             + dispatch + workflow_call
```

Plus supporting infrastructure:

```
    .github/actions/git__increment-tag/action.yml   102 lines  Composite action
    scripts/gh-release-to-main.sh                     8 lines  Manual merge script
```


---

## 2. What's Good

**The priority-gated acceptance tests workflow is excellent.** `qa-acceptance-tests.yml`
is the best-designed file in the repo. Three parallel jobs (P0, P1, P2/P3) with
correct failure semantics: P0 blocks, P1 continues, P2/P3 informational. The
summary job aggregates results. This is the right architecture for release gating.

**The reusable workflow pattern is correct.** `ci-pipeline.yml` is a callable
workflow with parameterised inputs (branch, release type, target URL). The
branch-specific files (`__dev.yml`, `__main.yml`) are thin triggers. This is
the right separation.

**Auto-tagging with version file updates works.** The composite action handles
semver computation, README badge, version file, pyproject.toml, and tag push.
Pulls before push to handle upstream commits from earlier CI steps.

**JUnit XML test reports with artifact uploads.** Every acceptance test job
produces `reports/qa-{priority}-results.xml` and uploads screenshots as
artifacts. Good for debugging failed runs.


---

## 3. What's Wrong

### 3.1 Two Parallel Universes

The biggest problem: **there are two completely separate CI systems that
don't talk to each other.**

```
    UNIVERSE 1: ci-pipeline.yml (triggered by dev/main push)
    ┌─────────────────────────────────────────────────────────┐
    │  unit tests → integration tests → standalone tests      │
    │  → generate docs → diff screenshots → auto-commit       │
    │  → tag → deploy Jekyll site                             │
    │                                                         │
    │  Runs: tests/unit/ + tests/integration/ + tests/standalone/│
    │  Does NOT run: tests/qa/v030/                            │
    │  Does: doc generation, screenshot commit, site deploy    │
    │  Does: version tagging                                   │
    └─────────────────────────────────────────────────────────┘

    UNIVERSE 2: qa-acceptance-tests.yml (triggered by feature branches)
    ┌─────────────────────────────────────────────────────────┐
    │  P0 gate → P1 suite → P2/P3 suite → summary            │
    │                                                         │
    │  Runs: tests/qa/v030/ (with priority markers)            │
    │  Does NOT run: tests/unit/ or tests/integration/         │
    │  Does NOT: generate docs or deploy site                  │
    │  Does NOT: tag versions                                  │
    │  Does NOT: run on dev or main branches                   │
    └─────────────────────────────────────────────────────────┘
```

**The v030 acceptance tests don't run on dev or main pushes.** The most
important tests (zero-knowledge, combined link, friendly token, access
gate) only run on feature branches. When you push to dev, only the
legacy integration tests and standalone tests run — the ones that
produce S3 error screenshots.

**The doc generation pipeline doesn't use the v030 tests.** The CI
pipeline runs `tests/integration/` (legacy, hits prod) and
`tests/standalone/` (access gate only), then generates docs from those
screenshots. The 10 v030 test files with 47 test methods are excluded.

### 3.2 Massive Setup Duplication

Every job in `qa-acceptance-tests.yml` repeats the same 4 setup steps:

```
    - Checkout                          ~5 sec
    - Setup Python 3.12                 ~15 sec
    - Install QA deps + Playwright      ~60 sec
    - Clone + install SG/Send dev       ~45 sec
    ─────────────────────────────────────────────
    TOTAL setup per job:                ~2 min
    × 3 parallel jobs (P0, P1, P2/P3) = ~6 min wasted on setup
```

The SG/Send dev clone is particularly expensive — it clones the entire
repo (even with `--depth 1`) and installs it. This happens 3 times in
parallel, hitting GitHub 3 times for the same repo.

### 3.3 No Dependency Caching

Neither workflow caches anything:

- No pip cache (reinstalls all packages every run)
- No Playwright browser cache (reinstalls Chromium every run)
- No SG/Send clone cache (clones from GitHub every run)

For a test suite that should provide "fast feedback," every run pays
the full cold-start penalty.

### 3.4 Sequential Where It Could Be Parallel

In `ci-pipeline.yml`, the flow is:

```
    unit tests → browser tests → (tag + deploy)
                                    sequential
```

Unit tests must pass before browser tests start. But within browser tests,
the step runs `tests/integration/` THEN `tests/standalone/` sequentially
in the same job. These could be parallel jobs.

### 3.5 No Multi-Target Testing

Both workflows hardcode `https://send.sgraph.ai` as the target. The
stakeholder feedback specifically calls for tests running against dev,
main, AND prod. There's no matrix or parameterised target.

### 3.6 Dead Integration Tests

`ci-pipeline.yml` runs `tests/integration/` — which contains only
`test_landing_page.py` (3 tests that produce S3 error screenshots).
These tests hit production `send.sgraph.ai` and don't work because
the CDN setup changed. They're not useful but they run on every
dev and main push.

### 3.7 Acceptance Tests Not Wired to Site Deploy

The acceptance tests capture screenshots and upload them as artifacts,
but they don't commit them to the repo or trigger doc generation. The
screenshots are ephemeral — visible in GitHub Actions artifacts for 30
days, then gone. The site only gets screenshots from the (broken)
legacy tests.


---

## 4. Proposed Architecture — Unified Multi-Layer Pipeline

### 4.1 Design Principles

```
    1. ONE pipeline, not two.
    2. Fast feedback: unit tests in <30 sec, P0 gate in <2 min.
    3. Parallel where possible, sequential only where necessary.
    4. Cache aggressively: pip, Playwright, SG/Send clone.
    5. Multi-target: test against QA server, dev, and prod.
    6. Every test run updates the site (screenshots + docs).
    7. Priority gating: P0 blocks, P1 warns, P2/P3 informational.
```

### 4.2 Proposed Workflow Structure

Replace 4 workflows with 3:

```
    PROPOSED WORKFLOWS:

    ci-pipeline.yml              ← REWRITE: unified, layered, cached
    ci-pipeline__dev.yml         ← KEEP: thin trigger for dev
    ci-pipeline__main.yml        ← KEEP: thin trigger for main

    qa-acceptance-tests.yml      ← REMOVE: merged into ci-pipeline.yml
```

### 4.3 Unified Pipeline Architecture

```
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                     UNIFIED CI PIPELINE                                 │
    │                                                                         │
    │  LAYER 1: SETUP (shared, cached)                                        │
    │  ┌───────────────────────────────────────────────────────────────────┐  │
    │  │                        setup                                      │  │
    │  │  ┌──────────┐  ┌──────────────┐  ┌────────────────────────────┐  │  │
    │  │  │ Checkout  │  │ Python 3.12  │  │ pip cache + Playwright    │  │  │
    │  │  │          │  │ + pip cache  │  │ browser cache              │  │  │
    │  │  └──────────┘  └──────────────┘  └────────────────────────────┘  │  │
    │  │                                                                   │  │
    │  │  ┌────────────────────────────────────────────────────────────┐   │  │
    │  │  │ Clone + install SG/Send dev (cached by commit SHA)         │   │  │
    │  │  └────────────────────────────────────────────────────────────┘   │  │
    │  │                                                                   │  │
    │  │  OUTPUT: installed environment as artifact / cache key             │  │
    │  └───────────────────────────────────────────────────────────────────┘  │
    │         │                                                               │
    │         ▼                                                               │
    │  LAYER 2: FAST GATE (must pass, <60 sec)                                │
    │  ┌───────────────────────────────────────────────────────────────────┐  │
    │  │         unit-tests              p0-gate                           │  │
    │  │  ┌─────────────────┐    ┌─────────────────────┐                  │  │
    │  │  │ tests/unit/     │    │ tests/qa/v030/      │                  │  │
    │  │  │ ~4 tests        │    │ -m "p0"             │                  │  │
    │  │  │ No browser      │    │ Needs QA server     │                  │  │
    │  │  │ No server       │    │ + browser           │                  │  │
    │  │  │ ~10 sec         │    │ ~30-60 sec          │                  │  │
    │  │  └─────────────────┘    └─────────────────────┘                  │  │
    │  │        PARALLEL — both must pass to proceed                       │  │
    │  └───────────────────────────────────────────────────────────────────┘  │
    │         │                                                               │
    │         ▼                                                               │
    │  LAYER 3: FULL ACCEPTANCE (parallel by priority)                        │
    │  ┌───────────────────────────────────────────────────────────────────┐  │
    │  │   p1-browser        p1-api           p2-p3                        │  │
    │  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐          │  │
    │  │  │ -m "p1"     │  │ via__httpx/  │  │ -m "p2 or p3"   │          │  │
    │  │  │ Browser     │  │ -m "p1"     │  │ All test types   │          │  │
    │  │  │ tests       │  │ No browser  │  │ continue-on-error│          │  │
    │  │  │ continue-   │  │ ~20 sec     │  └──────────────────┘          │  │
    │  │  │ on-error    │  └─────────────┘                                │  │
    │  │  └─────────────┘                                                  │  │
    │  │        PARALLEL — P1 warns, P2/P3 informational                   │  │
    │  └───────────────────────────────────────────────────────────────────┘  │
    │         │                                                               │
    │         ▼                                                               │
    │  LAYER 4: DOCUMENTATION + DEPLOY (sequential)                           │
    │  ┌───────────────────────────────────────────────────────────────────┐  │
    │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │  │
    │  │  │ Collect all  │  │ Generate     │  │ Diff screenshots     │   │  │
    │  │  │ screenshots  │  │ docs         │  │ Auto-commit          │   │  │
    │  │  │ from L2+L3   │  │ (grouped     │  │ Deploy Jekyll        │   │  │
    │  │  │ artifacts    │  │  index, etc)  │  │ to GitHub Pages     │   │  │
    │  │  └──────────────┘  └──────────────┘  └──────────────────────┘   │  │
    │  └───────────────────────────────────────────────────────────────────┘  │
    │         │                                                               │
    │         ▼                                                               │
    │  LAYER 5: VERSION + RELEASE (conditional)                               │
    │  ┌───────────────────────────────────────────────────────────────────┐  │
    │  │  ┌──────────────────────────────┐  ┌────────────────────────┐   │  │
    │  │  │ Increment tag               │  │ QA Summary report      │   │  │
    │  │  │ (if on dev/main +            │  │ (pass/fail/warn per    │   │  │
    │  │  │  should_increment_tag)       │  │  priority level)       │   │  │
    │  │  └──────────────────────────────┘  └────────────────────────┘   │  │
    │  └───────────────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Key Design Decisions

**4.4.1 Split P1 into Browser vs API**

P1 tests include both browser tests (Playwright, slow) and API tests
(httpx, fast). Running them in separate parallel jobs means the fast
API tests don't wait for the slow browser tests.

```
    CURRENT:  P0 → [all P1 in one job] → [all P2/P3 in one job]
    PROPOSED: P0 → [P1-browser | P1-api | P2/P3]  ← all parallel
```

The `via__httpx/` tests (api_smoke, transfer_helper, zero_knowledge)
are 48 tests that run in ~20 seconds with no browser. They should
never wait for Playwright to render screenshots.

**4.4.2 Cache Strategy**

```
    ┌─────────────────────────────────────────────────────────────────┐
    │  CACHE LAYER                  KEY              SAVES            │
    ├─────────────────────────────────────────────────────────────────┤
    │  pip packages                 requirements.txt ~60 sec/job     │
    │                               hash                              │
    │  Playwright browser           playwright       ~30 sec/job     │
    │                               version hash                      │
    │  SG/Send dev clone            dev branch       ~45 sec/job     │
    │                               HEAD SHA                          │
    └─────────────────────────────────────────────────────────────────┘

    TOTAL SAVINGS (3 parallel jobs): ~4-5 min per run
```

Implementation uses GitHub Actions cache:

```yaml
    - uses: actions/cache@v4
      with:
        path: ~/.cache/pip
        key: pip-${{ hashFiles('requirements.txt') }}

    - uses: actions/cache@v4
      with:
        path: ~/.cache/ms-playwright
        key: playwright-${{ hashFiles('requirements.txt') }}

    - uses: actions/cache@v4
      with:
        path: /tmp/sgraph-send-dev
        key: sgraph-send-${{ steps.sg-sha.outputs.sha }}
```

**4.4.3 Screenshot Collection Across Jobs**

The current acceptance tests upload screenshots as artifacts per job.
The proposed pipeline needs to collect screenshots from ALL jobs (P0,
P1-browser, P2/P3) and merge them before doc generation.

```
    P0 job        → uploads: qa-screenshots-p0 artifact
    P1-browser    → uploads: qa-screenshots-p1 artifact
    P2/P3         → uploads: qa-screenshots-p2p3 artifact
                            ↓
    doc-gen job   → downloads all 3 artifacts
                  → merges into sg_send_qa__site/pages/use-cases/
                  → runs generate_docs + diff_screenshots
                  → commits + deploys
```

GitHub Actions supports this via `actions/upload-artifact` and
`actions/download-artifact` with different artifact names.

**4.4.4 Multi-Target Matrix (Future)**

Not for Phase 1, but the architecture supports it:

```yaml
    strategy:
      matrix:
        target:
          - { name: "qa-server", url: "local", type: "qa_server" }
          - { name: "dev",       url: "https://dev.send.sgraph.ai", type: "dev" }
          - { name: "prod",      url: "https://send.sgraph.ai",     type: "production" }
```

The QA server tests run in every pipeline. Dev/prod tests run on
scheduled cron or manual dispatch.


---

## 5. Proposed `ci-pipeline.yml` (Pseudocode)

```yaml
    name: CI Pipeline (Unified)

    on:
      workflow_call:
        inputs:
          git_branch:         { required: true, type: string }
          release_type:       { required: false, type: string, default: "" }
          should_increment_tag: { required: false, type: boolean, default: false }
        secrets:
          TEST_ACCESS_TOKEN: { required: false }

    env:
      PYTHON_VERSION: "3.12"
      QA_SUITE: "tests/qa/v030"

    permissions:
      contents: write
      pages: write
      id-token: write

    jobs:
      # ── LAYER 2a: Unit tests (fast, no browser, no server) ──────────
      unit-tests:
        runs-on: ubuntu-latest
        steps:
          - checkout
          - setup-python + pip-cache
          - pip install -r requirements.txt
          - pytest tests/unit/ -v                          # ~10 sec

      # ── LAYER 2b: P0 gate (browser + QA server, must pass) ─────────
      p0-gate:
        runs-on: ubuntu-latest
        steps:
          - checkout
          - setup-python + pip-cache
          - playwright-cache
          - install deps + playwright + sg-send-dev (cached)
          - pytest $QA_SUITE -m "p0" -v --tb=short
              --junit-xml=reports/qa-p0.xml                # ~60 sec
          - upload screenshots artifact (qa-screenshots-p0)
          - upload junit artifact

      # ── LAYER 3a: P1 browser tests (parallel, continue-on-error) ───
      p1-browser:
        needs: [unit-tests, p0-gate]
        runs-on: ubuntu-latest
        steps:
          - (same setup as p0-gate, cached)
          - pytest $QA_SUITE -m "p1" -v --tb=short
              --ignore=$QA_SUITE/via__httpx
              --junit-xml=reports/qa-p1-browser.xml
            continue-on-error: true
          - upload screenshots artifact (qa-screenshots-p1)

      # ── LAYER 3b: P1 API tests (parallel, fast, no browser) ────────
      p1-api:
        needs: [unit-tests, p0-gate]
        runs-on: ubuntu-latest
        steps:
          - checkout + setup-python + pip-cache
          - install deps + sg-send-dev (cached, NO playwright)
          - pytest $QA_SUITE/via__httpx/ -m "p1" -v --tb=short
              --junit-xml=reports/qa-p1-api.xml            # ~20 sec
            continue-on-error: true

      # ── LAYER 3c: P2/P3 (parallel, informational) ──────────────────
      p2-p3:
        needs: [unit-tests, p0-gate]
        runs-on: ubuntu-latest
        steps:
          - (same setup as p0-gate, cached)
          - pytest $QA_SUITE -m "p2 or p3" -v --tb=short
              --junit-xml=reports/qa-p2p3.xml
            continue-on-error: true
          - upload screenshots artifact (qa-screenshots-p2p3)

      # ── LAYER 4: Docs + Deploy ──────────────────────────────────────
      docs-and-deploy:
        needs: [p0-gate, p1-browser, p1-api, p2-p3]
        if: always() && needs.p0-gate.result == 'success'
        runs-on: ubuntu-latest
        environment:
          name: github-pages
        steps:
          - checkout (fetch-depth: 0)
          - download all screenshot artifacts
          - merge screenshots into sg_send_qa__site/
          - pip install + run generate_docs
          - run diff_screenshots
          - git-auto-commit (screenshots + docs)
          - setup Ruby + Jekyll build
          - upload-pages-artifact + deploy-pages

      # ── LAYER 5: Tag + Summary ──────────────────────────────────────
      tag-and-summary:
        needs: [unit-tests, p0-gate, p1-browser, p1-api, p2-p3, docs-and-deploy]
        if: always()
        runs-on: ubuntu-latest
        steps:
          - checkout (fetch-depth: 0)
          - print summary (P0/P1/P2/P3 results)
          - increment tag (if should_increment_tag && P0 passed)
          - fail if P0 failed
```

### 5.1 Execution Time Estimate

```
    CURRENT PIPELINE (ci-pipeline.yml on dev push):
    ┌───────────────┐
    │ unit tests    │ ~30 sec
    └───────┬───────┘
            ▼
    ┌───────────────┐
    │ browser tests │ ~3-4 min (integration + standalone + docs + commit)
    └───────┬───────┘
            ▼
    ┌───────┬───────┐
    │ tag   │ deploy│ ~2 min
    └───────┴───────┘
    TOTAL: ~6-7 min SEQUENTIAL, runs only legacy tests


    PROPOSED PIPELINE:
    ┌──────────────────────────────────────────────────────┐
    │  unit-tests  |  p0-gate                              │  LAYER 2
    │  ~10 sec     |  ~60 sec (with caching)               │  PARALLEL
    └──────────────┴───────────┬────────────────────────────┘
                               │
    ┌──────────────────────────┴───────────────────────────┐
    │  p1-browser  |  p1-api   |  p2-p3                    │  LAYER 3
    │  ~90 sec     |  ~20 sec  |  ~60 sec                  │  PARALLEL
    └──────────────┴───────────┴───────────┬───────────────┘
                                           │
    ┌──────────────────────────────────────┴────────────────┐
    │  docs-and-deploy                                      │  LAYER 4
    │  ~90 sec (collect + generate + diff + build + deploy) │  SEQUENTIAL
    └──────────────────────────────┬────────────────────────┘
                                   │
    ┌──────────────────────────────┴────────────────────────┐
    │  tag-and-summary                                      │  LAYER 5
    │  ~30 sec                                              │  SEQUENTIAL
    └──────────────────────────────────────────────────────┘

    TOTAL: ~4.5 min wall clock (L2 60s + L3 90s + L4 90s + L5 30s)
    vs current ~6-7 min — FASTER despite running 10x more tests
    
    CRITICAL PATH: p0-gate (60s) → p1-browser (90s) → docs (90s) → tag (30s)
                   = ~4.5 min if caches are warm
```

### 5.2 Cold Cache vs Warm Cache

```
    SETUP STEP                    COLD     WARM (cached)   SAVINGS
    ─────────────────────────────────────────────────────────────────
    pip install                   60 sec    5 sec          ~55 sec
    Playwright install            45 sec    3 sec          ~42 sec
    SG/Send clone + install       60 sec   10 sec          ~50 sec
    ─────────────────────────────────────────────────────────────────
    TOTAL per job                165 sec   18 sec         ~147 sec
    × 5 jobs                     825 sec   90 sec
    
    First run of the day: ~6-7 min total
    Subsequent runs:      ~4-5 min total
```


---

## 6. Additional Recommendations

### 6.1 Composite Action for Setup

Extract the repeated setup steps into a local composite action:

```
    .github/actions/qa-setup/action.yml

    Inputs: needs_playwright (bool), needs_sgraph_send (bool)
    
    Steps:
      1. Setup Python 3.12
      2. Restore pip cache
      3. pip install -r requirements.txt
      4. (if needs_playwright) Restore Playwright cache + install
      5. (if needs_sgraph_send) Restore SG/Send cache + clone + install
```

Every job calls this action instead of repeating setup steps.
Reduces YAML duplication from ~20 lines/job to 4 lines/job.

### 6.2 Test Path Constants

Define test paths as workflow-level env vars:

```yaml
    env:
      QA_SUITE:      "tests/qa/v030"
      QA_API_TESTS:  "tests/qa/v030/via__httpx"
      UNIT_TESTS:    "tests/unit"
      SITE_DIR:      "sg_send_qa__site"
```

When the Villager refactoring moves tests into group subdirectories,
only these env vars need to change — not every `run:` command.

### 6.3 Remove Dead Workflows

The legacy test paths in `ci-pipeline.yml` should be removed:

```
    REMOVE: python -m pytest tests/integration/ -v
            (hits production, produces S3 error screenshots)
    
    REMOVE: python -m pytest tests/standalone/ -v --tb=short
            (duplicate of v030 access_gate tests)
    
    REPLACE WITH: python -m pytest tests/qa/v030/ -v
```

### 6.4 Scheduled Prod Testing (Future)

Add a cron-triggered workflow that runs a subset of tests against
production:

```yaml
    on:
      schedule:
        - cron: '0 6 * * *'   # daily at 06:00 UTC
      workflow_dispatch:

    env:
      TEST_TARGET_URL: "https://send.sgraph.ai"
```

This catches regressions deployed to prod that the QA server tests
can't detect (CDN issues, deployment configuration, real S3 behaviour).

### 6.5 Workflow Dispatch Enhancements

Add useful dispatch inputs to the unified pipeline:

```yaml
    workflow_dispatch:
      inputs:
        run_p0_only:
          description: "Fast gate: P0 tests only"
          type: boolean
          default: false
        skip_deploy:
          description: "Skip doc deploy (faster iteration)"
          type: boolean
          default: false
        target_url:
          description: "Override target (for prod testing)"
          type: string
          default: ""
```


---

## 7. Migration Plan

### Phase 1: Add Caching (Non-Breaking)

Add cache steps to the existing workflows without changing structure.
Immediate speedup, zero risk.

```
    EFFORT: 30 min
    RISK: NONE — additive changes only
    TEST: Run pipeline, verify caches populate, verify second run is faster
```

### Phase 2: Create Composite Setup Action (Non-Breaking)

Extract `qa-setup/action.yml`. Refactor existing workflows to use it.
No behaviour change, just DRY.

```
    EFFORT: 30 min
    RISK: LOW — refactoring only
    TEST: All 4 workflows still trigger and pass
```

### Phase 3: Unify Pipelines (Breaking — Coordinate with Villager Refactoring)

Merge `qa-acceptance-tests.yml` into `ci-pipeline.yml`. Remove legacy
test paths. Add the 5-layer architecture. This should ship alongside
the test restructuring from the Villager brief (same commit or PR).

```
    EFFORT: 2-3 hours
    RISK: MEDIUM — changes what runs on every push
    TEST: Push to a feature branch, verify all layers execute.
          Push to dev, verify tag + deploy works.
```

### Phase 4: Multi-Target Matrix (After Refactoring Stabilises)

Add dev/prod targets as a workflow matrix. Add scheduled prod testing.

```
    EFFORT: 1 hour
    RISK: LOW — additive
    TEST: Manual dispatch with target_url override
```

### Phase Summary

```
    PHASE   SCOPE                      EFFORT     WHEN
    ────────────────────────────────────────────────────────────
      1     Add caching                30 min     NOW (standalone)
      2     Composite setup action     30 min     NOW (standalone)
      3     Unify pipelines            2-3 hrs    WITH Villager refactoring
      4     Multi-target matrix        1 hr       AFTER refactoring
    ────────────────────────────────────────────────────────────
            TOTAL                      4-5 hrs
```


---

## 8. Interaction with Villager Refactoring

The CI pipeline changes are tightly coupled with the Villager brief's
Phase 4 (filesystem restructuring). When test files move into group
subdirectories, the CI paths must update simultaneously.

**Recommendation:** Ship DevOps Phases 1-2 immediately (caching + setup
action). Ship DevOps Phase 3 in the same PR as the Villager Phase 4.
This ensures paths stay consistent.

The refactored `generate_docs.py` (Villager Phase 3) also affects the
CI pipeline — the doc generation step needs to call the new entry point.
Coordinate with the Dev.


---

## 9. Success Criteria

```
    ☐  Single unified workflow (ci-pipeline.yml) handles all test types
    ☐  qa-acceptance-tests.yml removed (merged into unified)
    ☐  P0, P1, P2/P3 run in parallel with correct failure semantics
    ☐  P1 split into browser (slow) and API (fast) parallel jobs
    ☐  pip, Playwright, and SG/Send caches warm on second run
    ☐  Composite setup action eliminates YAML duplication
    ☐  Legacy test paths (integration/, standalone/) removed
    ☐  All test screenshots feed into site deployment
    ☐  v030 tests run on dev and main pushes (not just feature branches)
    ☐  Wall clock time ≤5 min with warm caches
    ☐  Dead tests/integration/user/test_landing_page.py archived
```

---

*DevOps review · SG/Send QA · v0.2.14 · 23 March 2026*

---

## Cross-References (Brief Pack)

| Related Document | Relevance |
|-----------------|-----------|
| [00 Introduction](00-introduction.md) | Three execution modes — CI is mode 3 |
| [03 Dev](03-dev__implementation-plan.md) | Test restructuring that changes CI paths (coordinate Phase 4) |
| [05 Refactoring Brief](05-conductor__villager-refactoring-brief.md) | Full audit including CI workflow assessment |
