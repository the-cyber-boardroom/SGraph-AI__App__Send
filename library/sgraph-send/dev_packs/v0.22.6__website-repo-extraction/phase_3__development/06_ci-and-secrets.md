# Phase 3 — CI Workflow and Secrets

**v0.22.6 | 24 April 2026**

This document covers the edits to `.github/workflows/deploy-website.yml` and the GitHub secrets that must be present on the target repo.

---

## Reference — source workflow (`.github/workflows/deploy-website.yml`)

For context, the source workflow (as of 24 April 2026) does the following:

1. Triggers on push to `dev` or `main` when paths under `sgraph_ai__website/**` or specific scripts change.
2. Also supports `workflow_dispatch` with an environment selector (`production` | `main` | `dev`).
3. Concurrency group: `website-deploy-{env}` — prevents parallel deploys to the same env.
4. Env vars: `AWS_REGION=eu-west-2`, `WEBSITE_DIR=sgraph_ai__website`, `SITE_NAME=sgraph-ai`.
5. Steps:
   - Checkout
   - Setup Python 3.12
   - Configure AWS credentials (from secrets)
   - Read version: `cat sgraph_ai_app_send/version`
   - Run `python scripts/generate_i18n_pages.py`
   - Resolve deploy environment (production/main/dev) → S3 path suffix
   - Run `python scripts/deploy_static_site.py` with bucket, CF distribution IDs, version, source dir, smoke-test URL, version file
   - Run `python scripts/store_ci_artifacts.py`

---

## Required edits for the target repo

Replace the workflow in the target repo with a version that reflects the new paths. The structural logic stays the same — only the paths change.

### Edit W1 — Path filter on `paths:`

**Source:**
```yaml
paths:
  - 'sgraph_ai__website/**'
  - 'scripts/deploy_static_site.py'
  - 'scripts/store_ci_artifacts.py'
  - 'scripts/generate_i18n_pages.py'
  - '.github/workflows/deploy-website.yml'
```

**Target — option A (recommended, simplest):** remove the `paths:` filter entirely. Every push to `dev`/`main` in this dedicated repo deploys the website. There is no other reason for a push to happen.

```yaml
on:
  push:
    branches:
      - dev
      - main
  workflow_dispatch:
    inputs: ...
```

**Target — option B (fine-grained):** keep `paths:` but drop the `sgraph_ai__website/` prefix on the first entry:

```yaml
paths:
  - '**'
  - '!**/*.md'
  - '!MIGRATION-REPORT.md'
```

Recommend option A — it is clearer for a single-purpose repo.

### Edit W2 — `env:` block

**Source:**
```yaml
env:
  AWS_REGION  : eu-west-2
  WEBSITE_DIR : sgraph_ai__website
  SITE_NAME   : sgraph-ai
```

**Target:**
```yaml
env:
  AWS_REGION : eu-west-2
  WEBSITE_DIR: .
  SITE_NAME  : sgraph-ai
```

(Alternatively, drop `WEBSITE_DIR` entirely and hard-code `.` in the `--source-dir` argument below. Kept for minimal diff.)

### Edit W3 — Read version

**Source:**
```yaml
- name: Read version
  id: version
  run: echo "version=$(cat sgraph_ai_app_send/version)" >> $GITHUB_OUTPUT
```

**Target:**
```yaml
- name: Read version
  id: version
  run: echo "version=$(cat version)" >> $GITHUB_OUTPUT
```

### Edit W4 — Deploy step `--version-file`

**Source:**
```yaml
- name: Deploy static site
  run: |
    python scripts/deploy_static_site.py \
      --site ${{ env.SITE_NAME }} \
      --version ${{ steps.version.outputs.version }} \
      --source-dir ${{ env.WEBSITE_DIR }} \
      --bucket ${{ secrets.WEBSITE_S3_BUCKET }} \
      --region ${{ env.AWS_REGION }} \
      --deploy-env ${{ steps.env.outputs.deploy_env }} \
      --cloudfront-distribution-id ${{ secrets.WEBSITE_CF_DIST }} ${{ secrets.WEBSITE_CF_DIST_MAIN }} \
      --smoke-test-url "https://sgraph.ai" \
      --version-file sgraph_ai_app_send/version
```

**Target:**
```yaml
- name: Deploy static site
  run: |
    python scripts/deploy_static_site.py \
      --site ${{ env.SITE_NAME }} \
      --version ${{ steps.version.outputs.version }} \
      --source-dir ${{ env.WEBSITE_DIR }} \
      --bucket ${{ secrets.WEBSITE_S3_BUCKET }} \
      --region ${{ env.AWS_REGION }} \
      --deploy-env ${{ steps.env.outputs.deploy_env }} \
      --cloudfront-distribution-id ${{ secrets.WEBSITE_CF_DIST }} ${{ secrets.WEBSITE_CF_DIST_MAIN }} \
      --smoke-test-url "https://sgraph.ai" \
      --version-file version
```

Two changes: `--source-dir sgraph_ai__website` → `--source-dir .` (via `${{ env.WEBSITE_DIR }}`), and `--version-file sgraph_ai_app_send/version` → `--version-file version`.

### Edit W5 — Everything else stays

Checkout, Python setup, AWS credentials, concurrency group, environment resolution, `store_ci_artifacts.py` step, smoke-test URL, CF distribution IDs: all unchanged.

---

## GitHub Actions secrets required on target repo

These five secrets must exist on the new repo for the workflow to succeed. They can have the same VALUES as in the source repo (same AWS credentials, same bucket, same CF distributions — this is a code move, not an infra rebuild).

| Secret name | Purpose | Expected value |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | AWS access key for S3 + CloudFront operations | Copy from source repo secrets |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | Copy from source repo secrets |
| `WEBSITE_S3_BUCKET` | S3 bucket holding static assets | Convention: `{account-id}--static-sgraph-ai--{region}` |
| `WEBSITE_CF_DIST` | CloudFront distribution ID for prod | `E2YZA5CZTJE62H` (referenced in `cloudfront/url-rewrite.js` as a comment) |
| `WEBSITE_CF_DIST_MAIN` | CloudFront distribution ID for main/staging | Copy from source repo secrets |

**Migration agent behaviour:**
- Check whether these secrets already exist on the target repo (via `gh secret list` equivalent in the GitHub MCP server — verify tool availability first).
- If you can set them programmatically, do so using values copy-pasted by the human at briefing time. **Never log or commit secret values.**
- If you cannot set them, list the missing names in the migration report and ask the human.

---

## GitHub environments (`dev`, `main`, `production`)

The source workflow uses `environment: ${{ ... }}` at the job level:

```yaml
environment: ${{ inputs.environment || (github.ref_name == 'main' && 'main') || 'dev' }}
```

This means GitHub "environments" must exist on the new repo with the names `dev`, `main`, and `production`. Each may have its own protection rules (e.g. required reviewers, branch restrictions).

**Migration agent behaviour:**
- Check whether the three environments exist on the target repo.
- If not, list them in the migration report and note that the workflow will fail to start until they are created. Do not attempt to create environments programmatically unless explicitly asked — environments may have protection rules the human wants to configure.

---

## First workflow run expectations

On the first push to the target repo's `dev` branch (after the migration PR merges):

1. Workflow triggers automatically.
2. Checkout succeeds.
3. Python setup succeeds.
4. AWS credentials configure.
5. Version reads as `v0.0.1` (from the new `version` file).
6. `generate_i18n_pages.py` runs, generating 16 locale folders.
7. `deploy_static_site.py` uploads to `s3://{bucket}/websites/sgraph-ai/dev/` and invalidates the dev CloudFront distribution.
8. `store_ci_artifacts.py` runs.
9. `https://dev.sgraph.ai` serves the new content (may take 30s–5min for CloudFront invalidation).

If any step fails, read the failure carefully before re-running. The most likely causes (ranked):

1. Missing GitHub environment (`dev`, `main`, or `production`).
2. Missing secret.
3. A path rewrite missed in [`05_path-rewrites-and-cross-references.md`](05_path-rewrites-and-cross-references.md).
4. An IAM permission not scoped to the new bucket path (unlikely if values were copied from source).

Document the failure and first-fix attempt in the migration report.

---

## What does NOT change

- CloudFront distributions (IDs, behaviours, functions, response-headers policies) are unchanged.
- S3 bucket is unchanged (same bucket, same `websites/sgraph-ai/{dev,main,prod}/` prefixes).
- DNS (Route 53 or equivalent) is unchanged.
- IAM policies are unchanged (the same AWS credentials still have the same permissions).
- The CORS Response Headers Policy on CloudFront for `/_common/**` is unchanged.

---

## Disabling the workflow in the source repo

Do **not** delete or disable the source repo's `.github/workflows/deploy-website.yml` in this session. That happens in Phase 5 after cutover. Until Phase 5, the source workflow will still trigger on pushes to Send repo's `dev`/`main`. That is acceptable because:

- The source repo's `sgraph_ai__website/` is unchanged (no pushes).
- Both workflows deploy to the same S3 prefix; whichever runs last wins. For the duration of the migration window, this is intentional — it ensures no gap in deployments.

Phase 5 addresses this cleanly.
