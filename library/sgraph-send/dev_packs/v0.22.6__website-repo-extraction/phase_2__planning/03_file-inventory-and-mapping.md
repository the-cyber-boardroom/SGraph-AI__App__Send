# Phase 2 — File Inventory and Mapping

**v0.22.6 | 24 April 2026**

Every file the migration agent must copy. Source path → target path. Anything not in this document **does not move**.

---

## A. Website root files

| Source | Target |
|---|---|
| `sgraph_ai__website/index.html` | `index.html` |
| `sgraph_ai__website/404.html` | `404.html` |
| `sgraph_ai__website/robots.txt` | `robots.txt` |
| `sgraph_ai__website/sitemap.xml` | `sitemap.xml` |
| `sgraph_ai__website/.gitignore` | `.gitignore` |
| `sgraph_ai__website/README.md` | `README.md` (edit — see 05_path-rewrites) |

---

## B. Locale source pages (`en-gb/`)

Copy the whole `sgraph_ai__website/en-gb/` tree to `en-gb/`. Verified contents:

```
en-gb/index.html
en-gb/product/index.html
en-gb/architecture/index.html
en-gb/contact/index.html
en-gb/early-access/index.html
en-gb/agents/index.html
en-gb/agents/keys.json
en-gb/agents/sherpa/index.html
en-gb/agents/ambassador/index.html
en-gb/agents/architect/index.html
en-gb/agents/designer/index.html
en-gb/pricing/index.html
en-gb/pricing/free/index.html
en-gb/pricing/cloud/index.html
en-gb/pricing/self-hosted/index.html
en-gb/pricing/managed/index.html
en-gb/pricing/dedicated/index.html
en-gb/pricing/your-cloud/index.html
en-gb/pricing/partners/index.html
en-gb/pricing/aws-marketplace/index.html
en-gb/payment/success/index.html
en-gb/payment/cancel/index.html
```

Other locale folders (`en-us/`, `pt-pt/`, etc.) at the source root are **generated** by `scripts/generate_i18n_pages.py` and may or may not be checked in. The migration agent should:

1. Copy any locale folder that exists at the source root, AS-IS.
2. After the move, run `python scripts/generate_i18n_pages.py` once in the new repo to verify regeneration works against the new layout.

---

## C. i18n translation files

Source: `sgraph_ai__website/i18n/*.json` (17 files)
Target: `i18n/` (same filenames)

Files (verified):
```
i18n/en-gb.json   (master)
i18n/en-us.json   i18n/pt-pt.json   i18n/pt-br.json
i18n/es-es.json   i18n/es-ar.json   i18n/es-mx.json
i18n/fr-fr.json   i18n/fr-ca.json
i18n/de-de.json   i18n/de-ch.json
i18n/it-it.json   i18n/nl-nl.json
i18n/pl-pl.json   i18n/ro-ro.json   i18n/hr-hr.json
i18n/tlh.json     (Klingon novelty)
```

---

## D. Top-level shared assets (`_common/`)

Copy `sgraph_ai__website/_common/` to `_common/` (entire tree). Verified subtrees:

- `_common/css/style.css`, `fonts.css`, `contact-form.js`
- `_common/js/i18n.js`
- `_common/fonts/DMSans-*.woff2` (5 weights), `JetBrainsMono-*.woff2` (2 weights), `fonts.css`
- `_common/img/logo/sg-send-logo-512.png`, `sg-send-logo-lockup.png`, `sg-send-favicon.svg`, `sg-send-favicon-32.png`
- `_common/favicon.svg`

Note: `_common/css/contact-form.js` is misplaced under `css/` in the source — preserve as-is. Do not relocate.

---

## E. IFD versioned tree (`v0/v0.2/v0.2.0/`)

Copy the entire `sgraph_ai__website/v0/` tree to `v0/`.

Major contents (verified):

**Page snapshots:**
- `v0/v0.2/v0.2.0/index.html`
- `v0/v0.2/v0.2.0/en-gb/index.html`, `pricing/index.html`, `how-it-works/index.html`, `security/index.html`, `vaults/index.html`

**Versioned shared CSS/JS:**
- `v0/v0.2/v0.2.0/_common/css/style.css`, `homepage.css`, `pricing.css`, `security.css`, `how-it-works.css`
- `v0/v0.2/v0.2.0/_common/css/fonts.css`
- `v0/v0.2/v0.2.0/_common/fonts/*.woff2` (all 7 fonts + fonts.css)
- `v0/v0.2/v0.2.0/_common/js/nav.js`, `i18n.js`, `pricing.js`, `token-bar.js`

**Web Components — sg-site-header (3 versions):**
- `v0/v0.2/v0.2.0/_common/js/components/sg-site-header/v1/v1.0/v1.0.4/{sg-site-header.js, .html, .css, manifest.json}`
- `v0/v0.2/v0.2.0/_common/js/components/sg-site-header/v1/v1.0/v1.0.5/{sg-site-header.js, .html, .css, manifest.json}`
- `v0/v0.2/v0.2.0/_common/js/components/sg-site-header/v1/v1.0/v1.0.6/{sg-site-header.js, .html, .css}` (no manifest.json — verify)

**Web Components — 10 homepage sections (each at v1/v1.0/v1.0.0):**
```
sg-send-hero/         sg-vault-patterns/    sg-runs-anywhere/
sg-vault-primitives/  sg-use-cases/         sg-tools-section/
sg-privacy-statement/ sg-pricing-teaser/    sg-oss-section/
sg-site-footer/
```
Each contains `{component-name}.{js, html, css}` at `v1/v1.0/v1.0.0/`.

**Use-case screenshots (13 files):**
```
v0/v0.2/v0.2.0/_common/images/sg-send/use-cases/
  01-vault-browse.png        02-markdown-article.png    03-gallery.png
  04-upload-flow.png         05-push-pull-badge.png     07-send-main.png
  07-vault-landing.png       08-token-receive.png       11-vault-browse-brief.png
  12-pdf-split-view.jpeg     13-agent-session-tree.jpeg
  14-medical-page-json.png   15-medical-vault-split.jpeg
  README.md
```

---

## F. CloudFront function

| Source | Target |
|---|---|
| `sgraph_ai__website/cloudfront/url-rewrite.js` | `cloudfront/url-rewrite.js` |

---

## G. Scripts (5 files move; 2 stay in Send repo)

**MOVE to `scripts/`:**

| Source | Target | Edits required |
|---|---|---|
| `scripts/deploy_static_site.py` | `scripts/deploy_static_site.py` | Verify default `--source-dir` value; see 05_path-rewrites |
| `scripts/generate_i18n_pages.py` | `scripts/generate_i18n_pages.py` | Verify any hard-coded `sgraph_ai__website/` path |
| `scripts/generate_sitemap.py` | `scripts/generate_sitemap.py` | Verify any hard-coded path |
| `scripts/store_ci_artifacts.py` | `scripts/store_ci_artifacts.py` | Likely no edits |
| `scripts/website__run-locally.sh` | `scripts/website__run-locally.sh` | Source dir reference must drop the `sgraph_ai__website/` prefix |

**Conditionally MOVE — verify first:**

| Source | Move? | How to decide |
|---|---|---|
| `scripts/inject_build_version.py` | Only if it is referenced by one of the migrating scripts or by `deploy-website.yml`. Grep for `inject_build_version` across the moving scripts and workflow. If unreferenced, leave in Send repo. |

**STAY in Send repo (do NOT move):**

```
scripts/generate_send_i18n_pages.py        # Send UI i18n
scripts/generate_vault_i18n_pages.py       # Vault UI i18n
```

---

## H. CI workflow

| Source | Target | Edits required |
|---|---|---|
| `.github/workflows/deploy-website.yml` | `.github/workflows/deploy-website.yml` | Significant — see 06_ci-and-secrets |

The Send repo will keep its copy temporarily (disabled in Phase 5).

---

## I. New files to CREATE in the target repo

These do not exist in the source — the migration agent creates them:

| File | Contents | Purpose |
|---|---|---|
| `version` | `v0.0.1` | Independent version stamp for website releases |
| `MIGRATION-REPORT.md` | See template in `04_migration-execution-plan.md` | Audit trail of the migration |
| `.github/workflows/deploy-website.yml` | Adapted (see 06) | CI |

If `sgraph_ai__website/.gitignore` is missing in the source, create `.gitignore` with:

```
.local-server-website/
__pycache__/
*.pyc
.DS_Store
.venv/
.env
```

---

## J. Counts (sanity check)

The migration agent should confirm these counts after the copy. Approximate, derived from the inventory:

| Category | Count |
|---|---|
| Top-level files (index, 404, robots, sitemap, .gitignore, README) | ~6 |
| Locale source HTML pages (en-gb/) | ~21 |
| i18n JSON files | 17 |
| Shared assets in `_common/` (root) | ~15 |
| Versioned tree files in `v0/v0.2/v0.2.0/` | ~80+ (includes 33 Web Component files = 11 components × 3 files, plus pages, CSS, JS, fonts, images) |
| Use-case images | 13 + README |
| CloudFront function | 1 |
| Scripts | 5 (or 6 if inject_build_version moves) |
| CI workflows | 1 |

If counts deviate significantly (e.g. Web Component files < 30), the agent should re-list the source tree and reconcile before proceeding.
