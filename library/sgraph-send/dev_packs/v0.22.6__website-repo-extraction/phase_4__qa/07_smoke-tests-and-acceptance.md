# Phase 4 — Smoke Tests and Acceptance Criteria

**v0.22.6 | 24 April 2026**

QA criteria for the migration. Every check must pass (or be explicitly waived by the human) before Phase 5 cutover.

---

## Acceptance criteria

### Repo structure

- [ ] `sgraph-ai/SGraph-AI__Website` exists and has been cloned successfully.
- [ ] The file counts in [`03_file-inventory-and-mapping.md`](../phase_2__planning/03_file-inventory-and-mapping.md) Section J match the files committed to the target repo (±1 per category is fine for spot-check errors).
- [ ] `version` file at the repo root contains `v0.0.1`.
- [ ] `MIGRATION-REPORT.md` exists at the repo root and is populated.
- [ ] No `sgraph_ai__website/` path prefix remains in any `.py`, `.sh`, `.yml`, or `.md` file. Verify with:
  ```
  grep -rn 'sgraph_ai__website' --include='*.py' --include='*.sh' --include='*.yml' .
  # Expect: 0 matches
  ```
- [ ] No `sgraph_ai_app_send/` path prefix remains. Verify with:
  ```
  grep -rn 'sgraph_ai_app_send' --include='*.py' --include='*.sh' --include='*.yml' .
  # Expect: 0 matches
  ```

### Local development

- [ ] `bash scripts/website__run-locally.sh` starts the local server on port 10060 without errors.
- [ ] `http://localhost:10060/en-gb/` loads the homepage.
- [ ] `http://localhost:10060/en-gb/pricing/` loads the pricing hub.
- [ ] `http://localhost:10060/en-gb/how-it-works/` loads (from the versioned tree).
- [ ] Browser console shows **no** 404s on `_common/` asset fetches.
- [ ] Browser console shows **no** 404s on Web Component `.html`/`.css` template fetches.
- [ ] `sg-site-header` renders with nav items and the logo links.
- [ ] Clicking a nav item navigates to the correct local URL (`http://localhost:10060/en-gb/...`, not `https://dev.sgraph.ai/...`).

### Script correctness

- [ ] `python3 scripts/generate_i18n_pages.py` runs without errors.
- [ ] After running, locale folders (`es-es/`, `pt-pt/`, `fr-fr/`, etc.) exist at the repo root with the expected page counts.
- [ ] `python3 scripts/generate_sitemap.py` runs without errors and writes `sitemap.xml` at the repo root.
- [ ] `sitemap.xml` contains entries for 17 locales × ~18 pages (roughly 306 URLs). Do not require an exact count — spot-check 5 entries.

### CI workflow (first run on dev branch)

- [ ] Workflow triggers automatically on merge to `dev`.
- [ ] Checkout, Python setup, and AWS credentials steps succeed.
- [ ] "Read version" step outputs `v0.0.1`.
- [ ] `generate_i18n_pages.py` step succeeds.
- [ ] "Resolve deployment environment" step sets `deploy_env=dev`.
- [ ] `deploy_static_site.py` step succeeds — uploads to S3 under `websites/sgraph-ai/dev/` and invalidates CloudFront.
- [ ] `store_ci_artifacts.py` step succeeds.
- [ ] Total workflow duration is reasonable (under 10 minutes).

### Deployed site (dev environment)

Run these against `https://dev.sgraph.ai` after the first workflow succeeds. Allow up to 5 minutes for CloudFront invalidation.

- [ ] `https://dev.sgraph.ai/en-gb/` returns HTTP 200 and renders the homepage.
- [ ] `https://dev.sgraph.ai/en-gb/pricing/` returns HTTP 200 and renders pricing.
- [ ] `https://dev.sgraph.ai/en-gb/how-it-works/` returns HTTP 200.
- [ ] `https://dev.sgraph.ai/en-gb/security/` returns HTTP 200.
- [ ] `https://dev.sgraph.ai/en-gb/vaults/` returns HTTP 200.
- [ ] `https://dev.sgraph.ai/v0/v0.2/v0.2.0/_common/js/components/sg-site-header/v1/v1.0/v1.0.6/sg-site-header.js` returns HTTP 200 and includes a CORS header:
  ```
  curl -sI https://dev.sgraph.ai/v0/v0.2/v0.2.0/_common/js/components/sg-site-header/v1/v1.0/v1.0.6/sg-site-header.js \
    | grep -i 'access-control-allow-origin'
  # Expect: access-control-allow-origin: *
  ```
- [ ] Browser DevTools on `https://dev.sgraph.ai/en-gb/` shows **no** 404s and **no** CORS errors.
- [ ] `sg-site-header` renders on the deployed site.
- [ ] Clicking the "Tools" nav item navigates to `https://dev.tools.sgraph.ai` (env-aware cross-site link — verifies v1.0.6 behaviour is preserved).
- [ ] `https://dev.sgraph.ai/sitemap.xml` returns HTTP 200 and is well-formed XML.
- [ ] `https://dev.sgraph.ai/robots.txt` returns HTTP 200.
- [ ] `https://dev.sgraph.ai/404-nonsense-xyz` returns the 404 page (via CloudFront error mapping — no action needed, just verify).

### Production protection (pre-cutover)

These must pass BEFORE the Phase 5 cutover. They confirm production is unaffected by the dev-environment deploy.

- [ ] `https://sgraph.ai/en-gb/` returns the CURRENT production homepage (not the migrated version yet — because we only pushed to dev).
- [ ] Production CloudFront distribution `E2YZA5CZTJE62H` has not received any invalidation from the new repo's workflow runs (check CloudFront console).
- [ ] The source repo's `deploy-website.yml` is still the system of record for production. No production deploy has been triggered from the new repo.

### Content parity (no regressions)

Compare dev site against the last source-repo deploy. A visual/structural diff is sufficient; pixel-perfect parity is not required.

- [ ] Homepage hero line matches: "Version-controlled, client-encrypted vaults. For humans and agents."
- [ ] Homepage renders all 10 section Web Components: hero, vault-patterns, runs-anywhere, vault-primitives, use-cases, tools-section, privacy-statement, pricing-teaser, oss-section, site-footer.
- [ ] Use-case screenshots load (not broken images).
- [ ] Fonts render correctly (DM Sans for body, JetBrains Mono for code).
- [ ] Favicon appears in the browser tab.
- [ ] Locale picker shows all 17 locales; non-English locales render Klingon/Portuguese/etc. correctly when selected.
- [ ] Contact form modal opens (no submission test needed in QA).
- [ ] Token bar appears on homepage with the expected placeholder text.

---

## Automated smoke-test snippet

The migration agent can run this after the dev deploy completes and paste output into the migration report:

```bash
set -e
BASE=https://dev.sgraph.ai
URLS=(
  "/en-gb/"
  "/en-gb/pricing/"
  "/en-gb/how-it-works/"
  "/en-gb/security/"
  "/en-gb/vaults/"
  "/sitemap.xml"
  "/robots.txt"
  "/v0/v0.2/v0.2.0/_common/js/components/sg-site-header/v1/v1.0/v1.0.6/sg-site-header.js"
)
for path in "${URLS[@]}"; do
  status=$(curl -sI -o /dev/null -w "%{http_code}" "$BASE$path")
  echo "$status  $BASE$path"
done

echo "---- CORS check ----"
curl -sI "$BASE/v0/v0.2/v0.2.0/_common/js/components/sg-site-header/v1/v1.0/v1.0.6/sg-site-header.js" \
  | grep -iE '^(access-control-allow-origin|content-type)'
```

Expected output: all 200s, plus `access-control-allow-origin: *` on the CORS check.

---

## Known-good reference points

When in doubt whether something is a regression or a pre-existing behaviour, compare against:

- The source repo commit at which the migration started (recorded in `MIGRATION-REPORT.md`).
- The reality document: `team/roles/librarian/reality/v0.16.26__what-exists-today.md` — sections on `sg-site-header`, the 10 homepage Web Components, and the v0.2.0 website content.
- The session brief: [`cross-site-nav-domain-convention.md`](../../../../team/humans/dinis_cruz/claude-code-web/04/24/cross-site-nav-domain-convention.md) — defines how env-aware cross-site links should resolve.

If the deployed site behaviour matches those references, the migration has preserved parity.

---

## Handing off to Phase 5

When all unchecked items above are either checked or explicitly waived by the human, the migration agent:

1. Finalises `MIGRATION-REPORT.md` with all results.
2. Commits and pushes the report.
3. Posts a summary to the human (not in GitHub comments — via the session transcript).
4. Phase 5 ([`08_cutover-and-cleanup.md`](../phase_5__release/08_cutover-and-cleanup.md)) begins once the human authorises.
