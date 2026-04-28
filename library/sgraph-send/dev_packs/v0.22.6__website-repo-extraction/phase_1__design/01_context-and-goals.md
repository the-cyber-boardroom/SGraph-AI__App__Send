# Phase 1 — Context and Goals

**v0.22.6 | 24 April 2026**

## What exists today

The sgraph.ai marketing website lives **inside** the SG/Send application repo at:

```
SGraph-AI__App__Send/sgraph_ai__website/
```

It is a pure static site:
- No build step (no webpack, Babel, TypeScript)
- No Python or JS package dependencies (uses only Python stdlib for deploy scripts)
- 17 locales (16 + Klingon novelty), pre-rendered HTML + client-side i18n
- IFD versioning model — versioned source folders (`v0/v0.2/v0.2.0/...`) overlaid into a `latest/` union on S3
- Web Components (Shadow DOM) for `sg-site-header` and 10 homepage sections
- Deployed via S3 + CloudFront (3 environments: dev, main, prod)
- CloudFront Response Headers Policy already provides CORS for `/_common/**` paths

The website's only soft dependency on the Send app is one file read in CI:

```yaml
# .github/workflows/deploy-website.yml line 67
echo "version=$(cat sgraph_ai_app_send/version)" >> $GITHUB_OUTPUT
```

There are **zero** Python imports, JS imports, or package-level dependencies between the website and the Send app code. They are physically co-located but logically independent.

---

## Why split now

**1. Different products, different cadence.**
The website is a marketing surface that changes daily (copy, screenshots, layout). The Send Lambda is an application that releases on a CI-driven version bump. Coupling their release cycles slows both down.

**2. Different audience for contribution.**
Designers, copywriters, and the Ambassador role contribute to the website. They should not need to clone or understand the Lambda backend to make a copy change.

**3. Cleaner CI surface.**
The deploy workflow currently runs on every push to `dev`/`main` that touches `sgraph_ai__website/**` *or* the listed scripts. Migrating to a dedicated repo removes the path filter complexity and isolates failure blast radius.

**4. Reflects the Wardley map.**
Per `team/humans/dinis_cruz/briefs/02/14/v0.3.2__briefs__wardley-maps-in-sgraph-project.md`, the marketing site is a separate component in the value chain. Giving it its own repo aligns repo topology with the value-chain topology already documented.

**5. Future cross-site reuse.**
`sg-site-header` v1.0.6 already encodes `HOST_SITE_MAP` for multiple sgraph.ai sites (Send, Tools, vault, etc.). A dedicated website repo is the natural home for any future shared web-component package, and the right place to coordinate cross-site URL conventions.

---

## Goals (in scope)

1. Create a new GitHub repo `sgraph-ai/SGraph-AI__Website` that contains everything needed to develop and deploy https://sgraph.ai (and dev/main environments).
2. Move the website source, deploy scripts, and CI workflow.
3. Preserve the live URL structure and S3/CloudFront infrastructure unchanged.
4. Establish independent versioning for the website (own `version` file).
5. Produce a clear migration report so the change is reviewable.
6. Leave the Send repo unchanged in this session — the new repo must work alongside the old one until QA confirms parity.

---

## Non-goals (out of scope)

1. **No infrastructure changes.** S3 bucket, CloudFront distributions, DNS, IAM, and the CORS Response Headers Policy stay exactly as they are.
2. **No URL changes.** `https://sgraph.ai/v0/v0.2/v0.2.0/_common/...` keeps resolving to the same content.
3. **No content changes.** This is a pure relocation. No copy edits, no design tweaks, no Web Component refactors.
4. **No removal from the Send repo.** Cleanup is a separate Phase 5 PR after the new repo is verified.
5. **No reorganisation of `team/`, `library/`, `.issues/`, or any project-knowledge artefacts.** They stay in the Send repo.
6. **No migration of `team/roles/journalist/site/`.** That is a Jekyll-based internal team comms blog — different stack, different audience, unrelated.
7. **No migration of `scripts/generate_send_i18n_pages.py` or `scripts/generate_vault_i18n_pages.py`.** Those generate i18n for the Send and Vault UIs, not the marketing website.
8. **No GitHub Pages, Jekyll, Hugo, or framework introduction.** The new repo keeps the existing pure-static + Web Components stack.

---

## Success looks like

- `sgraph-ai/SGraph-AI__Website` is a clone-and-go repo. A new contributor can `git clone`, run `bash website__run-locally.sh`, and see the site at `http://localhost:10060/en-gb/`.
- A push to the new repo's `dev` branch deploys to `https://dev.sgraph.ai` via the migrated workflow.
- A manual `workflow_dispatch` to `production` deploys to `https://sgraph.ai`.
- The Send repo continues to build and deploy the Send Lambda without regression. The website workflow in the Send repo is **disabled but not deleted** until cutover sign-off.
- The migration report (committed in the new repo) lists every file copied, every edit made, and any deviations from this plan.
