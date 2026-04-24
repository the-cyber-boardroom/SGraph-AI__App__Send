# Dev Pack — sgraph.ai Website Repo Extraction

**Version:** v0.22.6 | **Date:** 24 April 2026
**Status:** Plan only. Not yet executed.
**Branch (this repo):** `claude/review-header-nav-brief-Od5Zn`
**Target repo:** [`sgraph-ai/SGraph-AI__Website`](https://github.com/sgraph-ai/SGraph-AI__Website) — to be created/populated by the migration agent

This folder is the **single source of truth** for extracting the sgraph.ai marketing website out of the `SGraph-AI__App__Send` repo into a dedicated repo. Use it to brief the migration agent without re-reading the rest of this repo.

---

## TL;DR (30 seconds)

The sgraph.ai marketing website (static HTML/CSS/JS, S3 + CloudFront, IFD-versioned) currently lives inside `SGraph-AI__App__Send/sgraph_ai__website/` together with the SG/Send Lambda app. We are extracting it into its own repo.

**Why:**
- The website is a product (marketing surface) with a different release cadence and audience than the Send Lambda
- It has zero Python/code dependencies on the Send app — only a soft file dependency on `sgraph_ai_app_send/version`
- A dedicated repo makes ownership, CI, and contribution simpler

**What changes:**
- New repo `sgraph-ai/SGraph-AI__Website` becomes the home for the website source, deploy scripts, and CI workflow
- The `sgraph_ai__website/` prefix is dropped — content moves to repo root (it IS the repo)
- A new `version` file is created in the website repo (independent versioning)
- The deploy workflow is updated to read from the new layout
- The Send repo keeps its copy until the new repo is verified working — cleanup is a separate, later phase

**What does NOT change:**
- Production URL: `https://sgraph.ai` and the IFD URL structure (`/v0/v0.2/v0.2.0/...`) on the live site
- The S3 bucket convention (`{account-id}--static-sgraph-ai--{region}`) and CloudFront distributions
- The Web Component architecture (`sg-site-header`, `sg-send-hero`, etc.)
- The CORS Response Headers Policy on CloudFront (already provisioned externally)

---

## Reading Order

| Step | File | Purpose |
|------|------|---------|
| **Start here** | [`00_briefing-prompt.md`](00_briefing-prompt.md) | Copy-paste to brief the migration agent |
| 1 | [`phase_1__design/01_context-and-goals.md`](phase_1__design/01_context-and-goals.md) | What exists today, why we're splitting, non-goals |
| 2 | [`phase_2__planning/02_target-repo-structure.md`](phase_2__planning/02_target-repo-structure.md) | Layout of the new `SGraph-AI__Website` repo |
| 3 | [`phase_2__planning/03_file-inventory-and-mapping.md`](phase_2__planning/03_file-inventory-and-mapping.md) | Every file to copy and where it goes |
| 4 | [`phase_3__development/04_migration-execution-plan.md`](phase_3__development/04_migration-execution-plan.md) | Step-by-step execution for the migration agent |
| 5 | [`phase_3__development/05_path-rewrites-and-cross-references.md`](phase_3__development/05_path-rewrites-and-cross-references.md) | Edits required after the copy (paths, version, CI inputs) |
| 6 | [`phase_3__development/06_ci-and-secrets.md`](phase_3__development/06_ci-and-secrets.md) | GitHub Actions workflow + required repo secrets |
| 7 | [`phase_4__qa/07_smoke-tests-and-acceptance.md`](phase_4__qa/07_smoke-tests-and-acceptance.md) | Acceptance criteria + smoke tests |
| 8 | [`phase_5__release/08_cutover-and-cleanup.md`](phase_5__release/08_cutover-and-cleanup.md) | Switching prod traffic + removing from Send repo |
| Deep dive | [`99_source-documents.md`](99_source-documents.md) | Source briefs and prior art |

---

## Folder Structure

```
v0.22.6__website-repo-extraction/
  README.md                                       <- This file
  00_briefing-prompt.md                           <- Copy-paste session brief
  phase_1__design/
    01_context-and-goals.md
  phase_2__planning/
    02_target-repo-structure.md
    03_file-inventory-and-mapping.md
  phase_3__development/
    04_migration-execution-plan.md
    05_path-rewrites-and-cross-references.md
    06_ci-and-secrets.md
  phase_4__qa/
    07_smoke-tests-and-acceptance.md
  phase_5__release/
    08_cutover-and-cleanup.md
  99_source-documents.md
  issues/
    README.md
```

---

## Current Status by Phase

| Phase | Status | Owner | Notes |
|-------|--------|-------|-------|
| Phase 1: Design (context + goals) | Done | Explorer Dev | Inventory verified by Explore agent on 24 Apr |
| Phase 2: Planning (structure + mapping) | Done | Explorer Dev | All file moves enumerated |
| Phase 3: Development (execution) | Ready to start | Migration Agent | Awaits human go-ahead + new repo creation |
| Phase 4: QA | Not started | QA / Migration Agent | After Phase 3 |
| Phase 5: Release (cutover + cleanup) | Not started | Villager / Human | After QA sign-off |

**First action:** Human creates empty `sgraph-ai/SGraph-AI__Website` repo on GitHub, then briefs the migration agent using `00_briefing-prompt.md`.

---

## Key Decisions (with default recommendations)

The plan adopts these defaults. If a default is wrong, change the dev pack before executing — do not deviate ad-hoc.

1. **Flatten the directory tree.** Drop the `sgraph_ai__website/` prefix in the new repo — the repo IS the website.
2. **Independent `version` file** in the new repo (initialise at `v0.0.1`). The website releases on its own cadence.
3. **Move the deploy workflow** to the new repo — CI lives with code.
4. **Move all 5 website-specific scripts**: `deploy_static_site.py`, `generate_i18n_pages.py`, `generate_sitemap.py`, `store_ci_artifacts.py`, `website__run-locally.sh`.
5. **Do NOT move** `generate_send_i18n_pages.py` or `generate_vault_i18n_pages.py` — those are Send-app/Vault i18n, not website i18n.
6. **Do NOT move** `team/roles/journalist/site/` — that's an internal Jekyll comms tool, unrelated to the marketing site.
7. **Do NOT move** `team/`, `library/`, `.issues/`, or any role reviews/briefs/debriefs. Those are project-knowledge artefacts that stay in the Send repo. The new website repo gets a fresh `README.md` derived from `sgraph_ai__website/README.md` only.
8. **Do NOT delete** anything from the Send repo as part of this migration. Cleanup is Phase 5, scoped to a separate PR after QA passes.
9. **Reuse existing CloudFront distributions and S3 bucket.** The infrastructure is already provisioned — this is a code/CI move, not an infrastructure rebuild.
10. **Reuse existing GitHub Actions secret names** (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `WEBSITE_S3_BUCKET`, `WEBSITE_CF_DIST`, `WEBSITE_CF_DIST_MAIN`) in the new repo. Saves coordination.

---

## Open Questions (for the human)

These are NOT blockers for the agent to draft the migration, but the human should answer before cutover.

| # | Question | Where it lands |
|---|----------|----------------|
| Q1 | Should the new repo's default branch be `dev` (matching Send) or `main` (GitHub default)? | Affects branch protection + workflow triggers |
| Q2 | Will the new repo use the same Aurora design tokens / Web Components as Send, or are they about to fork? | Affects how `sg-site-header` is shared (in-repo vs separate package) |
| Q3 | Disable the `deploy-website.yml` workflow in the Send repo on cutover, or delete it? | Phase 5 cleanup detail |
| Q4 | Do we keep a tombstone/forwarding `sgraph_ai__website/README.md` in Send repo pointing at the new repo? | Recommended; confirm |

---

*Single source of truth for the website extraction migration.*
*Last updated: 24 April 2026.*
