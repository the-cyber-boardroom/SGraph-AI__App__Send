# Phase 5 — Cutover and Cleanup

**v0.22.6 | 24 April 2026**

Phase 5 has two parts: (1) promote the new repo to own production deploys, (2) remove the website code from the Send repo. Both are human-authorised. The agent prepares a PR; the human merges.

---

## Part 1 — Production cutover

Prerequisite: all acceptance criteria in [`07_smoke-tests-and-acceptance.md`](../phase_4__qa/07_smoke-tests-and-acceptance.md) are checked, and `https://dev.sgraph.ai` has been serving the new repo's output for at least one successful workflow run.

### Step 1.1 — Merge `dev` → `main` in the new repo

1. Open a PR from `dev` to `main` in `sgraph-ai/SGraph-AI__Website`.
2. Merge. The workflow triggers and deploys to `https://main.sgraph.ai`.
3. Run the dev-environment smoke tests (same list in 07) against `https://main.sgraph.ai` to confirm the main env is healthy.

### Step 1.2 — Production deploy from the new repo

1. From the new repo, trigger `workflow_dispatch` on `deploy-website.yml` with `environment=production`.
2. The workflow deploys to `websites/sgraph-ai/prod/` and invalidates the production CloudFront distribution (`E2YZA5CZTJE62H`).
3. Wait for CloudFront invalidation (typically 1–5 minutes).
4. Run smoke tests against `https://sgraph.ai`:
   - Same URL list as 07_smoke-tests, but pointed at `sgraph.ai` instead of `dev.sgraph.ai`.
   - Visual spot-check: homepage looks identical to the pre-cutover production site.

### Step 1.3 — Disable the source workflow

Immediately after the production deploy from the new repo succeeds, disable the source repo's workflow so it cannot trigger and overwrite production with a stale version.

**Option A — disable in GitHub UI (fastest, no commit):**
1. In `the-cyber-boardroom/sgraph-ai__app__send`, go to Actions → "Deploy Website - sgraph.ai" workflow → "..." menu → "Disable workflow".
2. Record the action in the cleanup PR's description.

**Option B — edit the workflow file (more auditable):**
1. On a feature branch, edit `.github/workflows/deploy-website.yml` in the Send repo:
   ```yaml
   on:
     # Disabled 2026-MM-DD — website moved to sgraph-ai/SGraph-AI__Website
     workflow_dispatch:
   ```
   Remove the `push:` trigger and keep only `workflow_dispatch:` so it cannot auto-run.
2. Commit, open PR, merge.

Recommend Option B — the commit history documents the change.

### Step 1.4 — Announce

Post in the team's comms channel (or create an entry in `team/comms/changelog/04/MM/` in the Send repo per the comms operating model — see `team/comms/README.md`):

> **Website cutover complete.** `https://sgraph.ai`, `https://main.sgraph.ai`, and `https://dev.sgraph.ai` are now deployed from `sgraph-ai/SGraph-AI__Website`. The `deploy-website.yml` workflow in the Send repo is disabled. Future website changes go in the new repo.

Include the link to the new repo and the cutover commit SHA.

---

## Part 2 — Cleanup in the Send repo

Prerequisite: Part 1 is complete. Production is healthy. The team has had at least one full working day to notice any regressions (suggested: wait 24 hours before starting cleanup — this is a soft wait, not a hard rule).

The cleanup agent operates on a feature branch in the Send repo and opens a PR. The human reviews and merges.

### Step 2.1 — Produce the deletion plan

The cleanup agent lists every file it intends to delete. Post this list as a PR description **before** making any deletions. The list should mirror what the migration copied (inverse of [`03_file-inventory-and-mapping.md`](../phase_2__planning/03_file-inventory-and-mapping.md)):

**Delete in Send repo:**
```
sgraph_ai__website/                          (entire tree)
scripts/deploy_static_site.py
scripts/generate_i18n_pages.py
scripts/generate_sitemap.py
scripts/store_ci_artifacts.py
scripts/website__run-locally.sh
scripts/inject_build_version.py              (only if it was moved in Phase 3)
.github/workflows/deploy-website.yml         (or keep disabled — see Step 2.3 Option C)
```

**Do NOT delete:**
```
scripts/generate_send_i18n_pages.py          # Send UI i18n — still used
scripts/generate_vault_i18n_pages.py         # Vault UI i18n — still used
team/roles/journalist/site/                  # Jekyll team comms — unrelated
sgraph_ai_app_send/                          # The Send Lambda
sgraph_ai_app_send__ui__*/                   # Send UIs
.github/workflows/*.yml                      # All OTHER workflows
team/, library/, .issues/                    # Project knowledge
```

### Step 2.2 — Tombstone

Leave a short tombstone file in place of the deleted tree, so historical references don't 404 in people's local clones or search results.

Create `sgraph_ai__website/MOVED.md`:

```markdown
# Moved

The sgraph.ai marketing website has moved to a dedicated repository:

**https://github.com/sgraph-ai/SGraph-AI__Website**

This folder previously contained the website source. All content, deploy
scripts, and CI workflow were relocated on 2026-MM-DD (commit SHA: ${CUTOVER_SHA}).

For development, clone the new repo:
```
git clone https://github.com/sgraph-ai/SGraph-AI__Website.git
```

Migration details: see `library/sgraph-send/dev_packs/v0.22.6__website-repo-extraction/`.
```

(Replace `${CUTOVER_SHA}` with the actual commit SHA from the cutover PR.)

### Step 2.3 — Handle the workflow file

Three options for the `.github/workflows/deploy-website.yml` in the Send repo:

- **Option A (recommended): delete it.** Clean break. The new repo is the only place the workflow lives.
- **Option B: keep it disabled.** If the team wants a paper trail of what used to happen here. The workflow is already disabled (from Part 1 Step 1.3); deleting is cleaner.
- **Option C: convert to a pointer.** Replace the workflow file with a comment-only YAML or a simple README that says "website deploys live in the SGraph-AI__Website repo".

Recommend Option A. The migration report and this dev pack are sufficient paper trail.

### Step 2.4 — Update the reality document

Edit `team/roles/librarian/reality/v0.16.26__what-exists-today.md` (or whatever the latest reality file is — pick the highest version):

- Add a section "WEBSITE MOVED" noting the new repo location and the cutover commit SHA.
- Remove or mark as "MOVED" any sections that enumerated website files (the 10 Web Components, `sg-site-header`, use-case screenshots, etc.). The code still exists, just not here.

Per the CLAUDE.md rule: "Update the reality document when you change code." Deleting code counts as changing it.

### Step 2.5 — Update the dev pack status

Edit the README of this dev pack:

```
Status: EXECUTED. Website successfully migrated to sgraph-ai/SGraph-AI__Website.
Cutover commit: ${CUTOVER_SHA}
Cleanup commit: ${CLEANUP_SHA}
```

The dev pack becomes historical record. Do not delete it — it is documentation for how the split happened.

### Step 2.6 — Changelog entry

Per the cross-team communication rule (CLAUDE.md rule 26): every code change that affects UI or API must have a changelog entry.

Create `team/comms/changelog/04/MM/v0.22.X__changelog__website-repo-split.md` (filling in the correct date and version):

```markdown
# Changelog — Website Repo Split

**Date:** 2026-MM-DD
**Version:** v0.22.X
**Type:** Infrastructure / repo topology

## What changed
The sgraph.ai marketing website was extracted from SGraph-AI__App__Send into
a dedicated repo: sgraph-ai/SGraph-AI__Website.

## Which tests SHOULD break
- None. Website code is gone from this repo; any tests that referenced
  sgraph_ai__website/ paths should fail to collect rather than run.

## Which tests should NOT break
- All Send Lambda tests (tests/unit/**) — the website extraction does not
  touch Send app code.
- All scripts/ tests except the 5 website-specific scripts (which moved).

## References
- Dev pack: library/sgraph-send/dev_packs/v0.22.6__website-repo-extraction/
- New repo: sgraph-ai/SGraph-AI__Website
- Cutover commit: ${CUTOVER_SHA}
```

### Step 2.7 — Open the PR and hand to human

1. Push the feature branch (`claude/website-cleanup-{session-id}`).
2. Open a PR into `dev` in the Send repo.
3. PR description includes:
   - Link to the new repo's `MIGRATION-REPORT.md`
   - The deletion list (from Step 2.1)
   - A note that the tombstone + changelog + reality-doc updates are included
4. The human reviews and merges.

---

## After Phase 5

The dev pack is complete. Subsequent website work happens in `sgraph-ai/SGraph-AI__Website`. Subsequent Send app work continues in `SGraph-AI__App__Send` as before.

Open questions that should be resolved at leisure (not blocking):

- When should `sg-site-header` be extracted into its own shared package (e.g. `sgraph-ai/SGraph-AI__WebComponents`)? Relevant when a third site (Tools, etc.) needs to embed it without duplicating. Not needed for the current Send + Tools + Website trio since the component is served from `sgraph.ai/_common/...` and imported by all of them already.
- Who owns the new website repo's contribution guide? (Likely Designer or Ambassador — assign in a follow-up session.)
- Should the Tools repo (separate, out of scope here) also be audited for a similar extraction? (Track in a separate dev pack if the answer is yes.)

These don't affect Phase 5 completion. They're future work.
