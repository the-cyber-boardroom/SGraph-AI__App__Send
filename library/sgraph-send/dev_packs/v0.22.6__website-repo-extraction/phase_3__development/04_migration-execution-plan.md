# Phase 3 — Migration Execution Plan

**v0.22.6 | 24 April 2026**

Step-by-step instructions for the migration agent. Execute strictly in order. Stop and ask the human if any step fails.

---

## Pre-flight checks

Before touching anything, confirm:

1. The migration agent has READ access to `the-cyber-boardroom/SGraph-AI__App__Send` (or whichever fork holds the source).
2. The migration agent has READ + WRITE access to `sgraph-ai/SGraph-AI__Website`.
3. The target repo `sgraph-ai/SGraph-AI__Website` exists. If empty (no commits), proceed. If non-empty, stop and ask the human.
4. The 5 GitHub Actions secrets exist on the target repo:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `WEBSITE_S3_BUCKET`
   - `WEBSITE_CF_DIST`
   - `WEBSITE_CF_DIST_MAIN`

   If any are missing, list them in the migration report and ask the human to populate before the first workflow run. Do not abort — file copy can proceed without secrets.

---

## Step 1 — Initialise target repo

On the target repo's default branch (or `main` if empty):

1. Create a feature branch: `claude/initial-migration-{session-id}`.
2. Add a placeholder `README.md` if the repo has zero files (so subsequent commits aren't to a detached state). One line is enough — it will be overwritten in Step 4.
3. Commit the placeholder. Push.

---

## Step 2 — Copy files (no edits yet)

Working from a local checkout (or via `mcp__github__push_files` / `mcp__github__create_or_update_file`), copy every file listed in [`03_file-inventory-and-mapping.md`](../phase_2__planning/03_file-inventory-and-mapping.md), Sections A–H, to the target repo.

Order matters less than completeness:
1. Section A (root files) → repo root
2. Section B (en-gb/) → `en-gb/`
3. Section C (i18n/) → `i18n/`
4. Section D (top-level `_common/`) → `_common/`
5. Section E (versioned `v0/`) → `v0/`
6. Section F (CloudFront function) → `cloudfront/`
7. Section G (scripts) → `scripts/` (only the 5 listed; conditionally `inject_build_version.py`)
8. Section H (CI workflow) → `.github/workflows/`

Commit in batches if doing many files at once — group commits by section so the history is readable. Suggested commit messages:

```
copy: website root files (index, 404, robots, sitemap, gitignore, readme)
copy: en-gb locale source pages
copy: i18n translation files (17 locales)
copy: top-level _common assets (css, js, fonts, images, favicon)
copy: versioned v0/ tree (pages, css, js, web components, use-case images)
copy: cloudfront/url-rewrite.js
copy: scripts (deploy_static_site, generate_i18n_pages, generate_sitemap, store_ci_artifacts, website__run-locally.sh)
copy: .github/workflows/deploy-website.yml (pre-edit)
```

Do not edit any file yet. The pure-copy commits make the diff in Step 3 easy to audit.

---

## Step 3 — Apply edits (path rewrites)

Apply every edit listed in [`05_path-rewrites-and-cross-references.md`](05_path-rewrites-and-cross-references.md). One commit per logical edit — do not bundle.

Then apply the workflow changes per [`06_ci-and-secrets.md`](06_ci-and-secrets.md). One commit.

Suggested commit messages:

```
fix(scripts): drop sgraph_ai__website/ prefix from website__run-locally.sh
fix(scripts): default --source-dir to repo root in deploy_static_site.py
fix(workflow): update WEBSITE_DIR, version source, path filters
docs: rewrite README for standalone repo context
```

---

## Step 4 — Create new files

1. Create `version` at the repo root with contents `v0.0.1` (no trailing newline beyond the standard one).
2. Create `MIGRATION-REPORT.md` (see template below) with sections to fill in as you go.
3. If `.gitignore` was absent in the source, create it now per [`03_file-inventory-and-mapping.md`](../phase_2__planning/03_file-inventory-and-mapping.md) Section I.

Commit:
```
add: version file (v0.0.1) and migration report scaffold
```

---

## Step 5 — Local verification

Before pushing for CI:

1. Run `python3 scripts/generate_i18n_pages.py --dry-run` (if it supports `--dry-run`; otherwise skip and run live in Step 6) and confirm no errors.
2. Run `python3 scripts/generate_sitemap.py` and confirm `sitemap.xml` matches the committed version (or commit any updates with a clear message).
3. Run `bash scripts/website__run-locally.sh` and:
   - Visit `http://localhost:10060/en-gb/` — homepage renders
   - Visit `http://localhost:10060/en-gb/pricing/` — pricing renders
   - Open browser DevTools console — no 404s on `_common/` assets, no 404s on Web Component `.html`/`.css` fetches
   - The `sg-site-header` Web Component renders the nav

If any of these fail, stop and post the failure to the migration report. Do not push.

---

## Step 6 — Push, run dev workflow, verify

1. Push the feature branch to `origin`.
2. Open a PR into the target repo's default branch (`dev` if it exists; `main` otherwise).
3. Merge the PR (or have the human merge) once review confirms file counts and edits.
4. After merge to `dev`, the workflow should auto-trigger and deploy to `https://dev.sgraph.ai`.
5. Run the smoke tests in [`07_smoke-tests-and-acceptance.md`](../phase_4__qa/07_smoke-tests-and-acceptance.md) against `https://dev.sgraph.ai`.
6. Append results to `MIGRATION-REPORT.md` and commit.

If the workflow fails, do not retry blindly. Investigate the failure, document it in the migration report, and decide whether the fix is in this dev pack's scope (path/CI edits) or a separate issue (infra, secrets, IAM).

---

## Step 7 — Hand off

Post a final summary in the migration report with:

- File counts copied (per section in 03_file-inventory)
- All commits made (titles + SHAs)
- Smoke-test results from Step 6
- Any deviations from the plan (and why)
- Open issues / questions for the human

The human moves to QA verification (07_smoke-tests-and-acceptance.md) and, on sign-off, to Phase 5 (cutover and cleanup).

---

## MIGRATION-REPORT.md template

The migration agent creates this file in the target repo at the repo root:

```markdown
# Migration Report — Website Extraction

**Source repo:** the-cyber-boardroom/SGraph-AI__App__Send (commit: ${SOURCE_SHA})
**Target repo:** sgraph-ai/SGraph-AI__Website
**Dev pack:** library/sgraph-send/dev_packs/v0.22.6__website-repo-extraction/
**Migration agent session:** ${SESSION_ID}
**Date:** ${ISO_DATE}

## Files copied (counts)

- Section A (root files): X / 6
- Section B (en-gb/): X / 21
- Section C (i18n/): X / 17
- Section D (top _common/): X
- Section E (versioned v0/): X
- Section F (cloudfront/): 1 / 1
- Section G (scripts): X / 5 (or 6 if inject_build_version moved)
- Section H (CI workflow): 1 / 1
- Total files: X

## Edits applied

(List every file changed in Step 3, with a one-line description.)

## New files created

- version (v0.0.1)
- .gitignore (only if absent in source)
- MIGRATION-REPORT.md (this file)

## Commit log

(Commit titles + SHAs in order.)

## Local verification (Step 5)

- generate_i18n_pages.py: PASS / FAIL (output)
- generate_sitemap.py: PASS / FAIL (output)
- website__run-locally.sh: PASS / FAIL (output)
- Browser smoke (homepage, pricing, header component): PASS / FAIL

## CI verification (Step 6)

- Dev workflow run URL:
- Result: PASS / FAIL
- https://dev.sgraph.ai smoke tests: see 07_smoke-tests-and-acceptance.md

## Deviations from plan

(List anything the agent did differently from the dev pack, with rationale.)

## Open items for human

(Any decisions or follow-ups.)
```
