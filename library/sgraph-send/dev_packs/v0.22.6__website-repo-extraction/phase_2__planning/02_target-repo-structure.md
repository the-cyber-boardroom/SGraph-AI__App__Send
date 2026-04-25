# Phase 2 — Target Repo Structure

**v0.22.6 | 24 April 2026**

This is the layout the migration agent will produce in `sgraph-ai/SGraph-AI__Website`. Every path is relative to the repo root.

---

## Top-level layout

```
SGraph-AI__Website/
  README.md                          <- Adapted from sgraph_ai__website/README.md
  MIGRATION-REPORT.md                <- Created by migration agent (post-execution)
  version                            <- New file. Initial contents: "v0.0.1"
  .gitignore                         <- Copied from sgraph_ai__website/.gitignore
  robots.txt                         <- Moved from sgraph_ai__website/robots.txt
  sitemap.xml                        <- Moved from sgraph_ai__website/sitemap.xml
  index.html                         <- Moved from sgraph_ai__website/index.html (root redirect)
  404.html                           <- Moved from sgraph_ai__website/404.html

  en-gb/                             <- Locale source (master)
    index.html
    product/index.html
    architecture/index.html
    contact/index.html
    early-access/index.html
    agents/                          <- Including agents/keys.json
    pricing/                         <- All 9 tier pages
    payment/                         <- success/, cancel/

  i18n/                              <- 17 locale JSON files (en-us, pt-pt, es-es, ...)

  _common/                           <- Shared assets (CSS, fonts, JS, images, favicon)
    css/
    js/
    fonts/
    img/

  v0/                                <- IFD versioned tree
    v0.2/v0.2.0/
      en-gb/                         <- Versioned page snapshots
      _common/
        css/
        js/
          components/                <- Web Components (sg-site-header, 10 sections)
          ...
        images/sg-send/use-cases/    <- 13 PNG/JPEG screenshots

  cloudfront/
    url-rewrite.js                   <- CloudFront function source

  scripts/
    deploy_static_site.py
    generate_i18n_pages.py
    generate_sitemap.py
    store_ci_artifacts.py
    website__run-locally.sh
    inject_build_version.py          <- See file inventory note (only if needed)

  .github/
    workflows/
      deploy-website.yml             <- Adapted from source workflow (see 06_ci-and-secrets.md)
```

---

## What is NOT created in the target repo

These exist in the source repo and are **deliberately excluded**:

| Source location | Why excluded |
|---|---|
| `sgraph_ai_app_send/` | The Send Lambda application — different repo's concern |
| `sgraph_ai_app_send__ui__admin/`, `sgraph_ai_app_send__ui__user/` | Send UIs, not the marketing site |
| `team/` (entire tree) | Project-knowledge artefacts stay in Send repo |
| `library/` | Specs, guides, dev_packs (including this one) stay in Send repo |
| `.issues/` | Issue tracker stays in Send repo |
| `tests/` | Send app tests, not website tests |
| `scripts/generate_send_i18n_pages.py` | Send UI i18n, not website i18n |
| `scripts/generate_vault_i18n_pages.py` | Vault UI i18n, not website i18n |
| `.github/workflows/jekyll-pages.yml` | Unrelated to the marketing website (verify scope before excluding — see Open Q below) |
| `team/roles/journalist/site/` | Internal Jekyll team-comms blog, unrelated stack |
| `pyproject.toml`, `requirements*.txt` | Send-app-only Python deps; the website needs only Python stdlib |
| `Dockerfile`, `.dockerignore` | Send-app deployment artefacts |

---

## Why the directory tree is flattened

In the source repo, content is namespaced under `sgraph_ai__website/` because the repo also hosts the Send app. The new repo IS the website, so the `sgraph_ai__website/` prefix has no purpose. Flattening:

- Makes `git clone && cd SGraph-AI__Website && bash scripts/website__run-locally.sh` work without wrappers
- Aligns with how every other dedicated SGraph site repo is structured
- Removes one configuration knob from the deploy workflow (`WEBSITE_DIR` becomes `.`)

URL paths in HTML files are **already absolute** (`/v0/v0.2/v0.2.0/_common/css/style.css`) and map to the deployed S3/CloudFront URL structure, not the repo structure. So flattening the repo does **not** require any HTML/CSS/JS edits.

---

## Two areas where the structure has equivalence questions

These are noted now because they may surface during execution. Default behaviour in each case is "preserve as-is":

1. **`sgraph_ai__website/_common/` vs `sgraph_ai__website/v0/v0.2/v0.2.0/_common/`** — the source repo has BOTH. The top-level `_common/` is the live root for the marketing site; the versioned `v0/...` `_common/` is the IFD archive used by the deploy script. Both must be copied to the target repo at their relative locations. Do not try to deduplicate.

2. **The locale-prefixed page tree** (`en-gb/...`) at the source root vs the versioned tree (`v0/v0.2/v0.2.0/en-gb/...`) — both exist in the source. Both must be copied. The deploy script reconciles them on S3. Do not try to deduplicate.

---

## Branch strategy in the new repo

- Default branch: **`dev`** (matches Send repo convention; see Open Q1 in `README.md`).
- Branch protection: enable on `dev` and `main` after first successful deploy. Not needed during migration.
- The migration agent's work happens on a feature branch in the target repo, e.g. `claude/initial-migration-{session-id}`. The first PR merges to `dev`.

---

## Open structural questions to verify during execution

The migration agent should flag these if the source-repo state contradicts the assumptions:

- Confirm `sgraph_ai__website/.gitignore` exists. If absent, create a minimal one (`.local-server-website/`, `__pycache__/`, `.DS_Store`).
- Confirm `sgraph_ai__website/_common/img/logo/sg-send-*` filenames. They are named `sg-send-*` despite being on the marketing site — that is intentional historical naming and should NOT be renamed during migration.
- Confirm `scripts/inject_build_version.py` is referenced by any of the migrating scripts. If unreferenced, it stays in the Send repo. If referenced by `deploy_static_site.py` or `store_ci_artifacts.py`, it moves.
