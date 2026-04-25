# Phase 3 — Path Rewrites and Cross-References

**v0.22.6 | 24 April 2026**

This document lists every file that needs editing after the copy in [`04_migration-execution-plan.md`](04_migration-execution-plan.md) Step 3. The CI workflow has its own document — see [`06_ci-and-secrets.md`](06_ci-and-secrets.md).

**Important:** the HTML, CSS, and JS source files in `en-gb/`, `_common/`, and `v0/` use **absolute URL paths** (`/v0/v0.2/v0.2.0/_common/...`, `/en-gb/...`) that match the deployed S3/CloudFront URL structure. They are **not** repo-relative. So flattening the repo (dropping the `sgraph_ai__website/` prefix) requires **zero edits** to these files.

The edits below are confined to: scripts that read from disk, the README, and (separately) the CI workflow.

---

## E1 — `scripts/website__run-locally.sh`

**Why:** this script builds a local IFD overlay in `.local-server-website/` by replaying the versioned source folders. In the source repo, source folders are under `sgraph_ai__website/`. In the target repo, they are at the root.

**Action:** open `scripts/website__run-locally.sh` and remove every occurrence of `sgraph_ai__website/` in path expressions. The script's `cd` and `find`/`cp` commands must operate from the repo root.

**How to verify:**
```
grep -n 'sgraph_ai__website' scripts/website__run-locally.sh
# Expect: 0 matches after edit
```

If the script uses a variable like `SOURCE_DIR=sgraph_ai__website`, change it to `SOURCE_DIR=.` (or remove the variable and use `.` inline).

---

## E2 — `scripts/deploy_static_site.py`

**Why:** the script accepts a `--source-dir` argument. The CI workflow currently passes `--source-dir sgraph_ai__website`. In the new repo, the source dir is the repo root.

**Action:**
1. Search the script for any **default value** of `--source-dir` that hard-codes `sgraph_ai__website`. If present, change the default to `.` (repo root).
2. Search for any other hard-coded `sgraph_ai__website/` path string. Replace with paths relative to the repo root (or, where appropriate, with the `--source-dir` argument).

**How to verify:**
```
grep -n 'sgraph_ai__website' scripts/deploy_static_site.py
# Expect: 0 matches after edit
```

The CLI signature should remain unchanged so the workflow can keep calling the script the same way (just with a different `--source-dir` value).

---

## E3 — `scripts/generate_i18n_pages.py`

**Why:** this script reads source HTML from `sgraph_ai__website/en-gb/...` and writes locale outputs back into the source tree.

**Action:**
1. Search for any constant like `WEBSITE_DIR = 'sgraph_ai__website'` or `SOURCE_DIR = ...`. If hard-coded, change to `'.'` (repo root) or accept as a CLI arg defaulting to `.`.
2. Search for path joins like `Path('sgraph_ai__website') / 'en-gb' / ...`. Replace with `Path('en-gb') / ...`.
3. The `SITE_URL = 'https://sgraph.ai'` constant is **correct as-is**. Do not change.

**How to verify:**
```
grep -n 'sgraph_ai__website' scripts/generate_i18n_pages.py
# Expect: 0 matches after edit
```

Run the script and confirm it generates locale folders at the repo root (e.g. `pt-pt/`, `es-es/`) — same place they were under the source's `sgraph_ai__website/`.

---

## E4 — `scripts/generate_sitemap.py`

**Why:** the script reads `i18n/` and writes `sitemap.xml` to the website root.

**Action:**
1. Search for hard-coded `sgraph_ai__website/` references. Rewrite to repo-root-relative paths.
2. The `SITE_URL = 'https://sgraph.ai'` constant is correct as-is.

**How to verify:**
```
grep -n 'sgraph_ai__website' scripts/generate_sitemap.py
# Expect: 0 matches after edit
```

After running, confirm `sitemap.xml` was written to the repo root (not to a `sgraph_ai__website/` subfolder).

---

## E5 — `scripts/store_ci_artifacts.py`

**Why:** likely no edits, but the agent should still grep.

**Action:**
```
grep -n 'sgraph_ai__website' scripts/store_ci_artifacts.py
grep -n 'sgraph_ai_app_send' scripts/store_ci_artifacts.py
```

If any matches: rewrite or document the deviation in the migration report.

---

## E6 — `scripts/inject_build_version.py` (conditional)

If the agent decided in Phase 2 to move this script (because it is referenced by the workflow or another moving script):

**Action:**
1. Grep for `sgraph_ai__website` and `sgraph_ai_app_send` in the script.
2. The `sgraph_ai_app_send/version` reference (if present) must change to read the new `version` file at the repo root.
3. Replace `Path('sgraph_ai_app_send/version')` (or similar) with `Path('version')`.

If the script is **not** moving, do nothing here — but record in the migration report that it was evaluated and left in the Send repo.

---

## E7 — `README.md` (the moved one)

**Why:** the source `sgraph_ai__website/README.md` is written for the context of being inside a larger repo. The new repo's README is the project's front door.

**Action:** rewrite the README so it:
1. Starts with a one-line description: "Source for https://sgraph.ai — the SGraph AI marketing website."
2. Describes the stack (static HTML/CSS/JS, S3 + CloudFront, IFD versioning, Web Components).
3. Documents local development: `bash scripts/website__run-locally.sh` → `http://localhost:10060/en-gb/`.
4. Documents deployment: pushed via `.github/workflows/deploy-website.yml` to dev/main/prod environments.
5. Lists the IFD versioning convention briefly.
6. Links to the migration report for historical context (commits before some point, see source repo).
7. Removes any content that only makes sense inside the Send repo (references to `team/`, `library/`, `.claude/`, `.issues/`, etc.).

Keep the README short — under 200 lines. Detailed architecture lives in the source repo's `library/` until the team decides what (if anything) to migrate into the website repo's docs.

---

## E8 — Internal documentation links (if any)

Search the moved files for references to source-repo-only paths:

```
grep -rn 'sgraph_ai_app_send' .
grep -rn 'team/' .
grep -rn 'library/' .
grep -rn '.issues/' .
```

For any matches:
- If the reference is a comment in code, evaluate whether it still makes sense (most won't — remove or rewrite).
- If the reference is in HTML content (unlikely), flag in the migration report and ask the human.

---

## E9 — Web Component `import` URLs (verify only — should NOT need edits)

The Web Components import `SgComponent` from a `tools.sgraph.ai` URL:

```js
import { SgComponent } from 'https://tools.sgraph.ai/components/base/v1/v1.0/v1.0.0/sg-component.js'
```

This is **correct as-is** and intentional. The URL is the production CDN-hosted base class. Do not change.

Similarly, `static jsUrl = import.meta.url` declarations are correct as-is — they let `SgComponent` fetch sibling templates from wherever the JS is served from. Do not modify.

---

## E10 — `sg-site-header` `HOST_SITE_MAP` and env detection (verify only)

The `sg-site-header` v1.0.6 component embeds:

```js
const HOST_SITE_MAP = {
    'sgraph.ai':             'Send',
    'dev.sgraph.ai':         'Send',
    'main.sgraph.ai':        'Send',
    'tools.sgraph.ai':       'Tools',
    'dev.tools.sgraph.ai':   'Tools',
    'main.tools.sgraph.ai':  'Tools',
}
```

These are production hostnames. They are correct as-is. **Do not edit.**

---

## Sanity grep at the end

After all edits in this document are applied, run:

```bash
grep -rn 'sgraph_ai__website' --include='*.py' --include='*.sh' --include='*.yml' --include='*.md' .
```

The only remaining matches should be in `MIGRATION-REPORT.md` (where the agent documents the migration). Anywhere else is a missed rewrite.
