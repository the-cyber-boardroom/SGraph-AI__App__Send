# Source Documents and Prior Art

**v0.22.6 | 24 April 2026**

Every source this dev pack drew on. If the migration agent needs deeper context, start here.

---

## Primary sources (read directly)

| Document | Path (relative to repo root) | What it provides |
|---|---|---|
| Project CLAUDE.md | `.claude/CLAUDE.md` | Non-negotiable project rules (Type_Safe, no mocks, IFD, branch naming, comms, security) |
| Explorer team CLAUDE.md | `.claude/explorer/CLAUDE.md` | Mission of the Explorer team (Genesis → Custom-Built, minor versions, what Explorers do/don't do) |
| Reality document (v0.16.26) | `team/roles/librarian/reality/v0.16.26__what-exists-today.md` | Code-verified record of every website file, Web Component, and deploy script as of 24 April 2026 |
| Latest debrief (24 April) | `team/humans/dinis_cruz/debriefs/04/24/v0.22.6__debrief__code-delivery-23-24-apr.md` | Documents the sg-site-header v1.0.4 → v1.0.6 evolution and 10 homepage Web Components |

## Session briefs (24 April) — read for context on recent work

| Document | Path | Relevance to this extraction |
|---|---|---|
| Session brief — sg-site-header v1.0.6 | `team/humans/dinis_cruz/claude-code-web/04/24/session-brief--sg-site-header-v1.0.6-nav-fixes.md` | Documents v1.0.6 nav fixes (in-place), HOST_SITE_MAP, `SgComponent` constraint |
| Cross-site nav domain convention | `team/humans/dinis_cruz/claude-code-web/04/24/cross-site-nav-domain-convention.md` | Defines the `{env.}{site.}sgraph.ai` convention the header component implements |
| CORS fix brief | `team/humans/dinis_cruz/claude-code-web/04/24/cors-fix-brief--dev-tools-sgraph-ai.md` | Explains the CloudFront Response Headers Policy that the new repo inherits (not migrated — infra is shared) |

## Deploy workflow and script references

| Document | Path | Relevance |
|---|---|---|
| Deploy workflow | `.github/workflows/deploy-website.yml` | The CI workflow being moved |
| Deploy script | `scripts/deploy_static_site.py` | ~25KB Python script — S3 upload, IFD overlay, CloudFront invalidation, smoke test |
| i18n page generator | `scripts/generate_i18n_pages.py` | ~14KB — pre-renders locale pages from en-gb source + i18n JSON |
| Sitemap generator | `scripts/generate_sitemap.py` | ~8KB — generates sitemap.xml with hreflang alternates |
| CI artifact storer | `scripts/store_ci_artifacts.py` | ~4KB — archives deployment metadata |
| Local dev launcher | `scripts/website__run-locally.sh` | Bash — builds IFD overlay locally, serves on port 10060 |

## Architecture references

| Document | Path | Relevance |
|---|---|---|
| S3 + CloudFront architecture | `team/roles/architect/reviews/03/01/v0.7.19__review__s3-cloudfront-static-migration-architecture.md` | Original architecture for the static site deployment |
| SEO infrastructure | `team/roles/architect/reviews/03/01/v0.7.6__review__seo-infrastructure.md` | Sitemap / hreflang / canonical URL strategy |
| Website redesign architecture | `team/roles/architect/reviews/04/21/v0.21.9__architect-review__website-redesign-first-pass.md` | Component architecture for current v0.2.0 homepage |

## Wardley / team context

| Document | Path | Relevance |
|---|---|---|
| Wardley Maps brief | `team/humans/dinis_cruz/briefs/02/14/v0.3.2__briefs__wardley-maps-in-sgraph-project.md` | Why the project separates Explorer/Villager/Town Planner — supports the argument for a dedicated website repo |
| Explorer role definition | `team/humans/dinis_cruz/briefs/02/14/v0.3.2__role-definition__explorer.md` | What this Explorer session is allowed to do |

## Prior related dev packs

| Dev pack | Path | Relevance |
|---|---|---|
| Library website | `library/sgraph-send/dev_packs/v0.19.7__library-website/` | Pattern precedent: creating a new dedicated SGraph repo with same static stack. The layout of this pack mirrors v0.19.7's layout. |
| sgraph.ai website redesign | `library/sgraph-send/dev_packs/v0.18.2__sgraph-ai-website-redesign/` | The redesign that produced the v0.2.0 content being migrated |

## Discovery report

The Phase 2 file inventory was produced by a subagent on 24 April 2026 with READ-ONLY access to the source repo. The full report is not checked in (ephemeral session artefact), but its findings are distilled into [`03_file-inventory-and-mapping.md`](phase_2__planning/03_file-inventory-and-mapping.md).

Scope of that discovery:
- Full tree of `sgraph_ai__website/`
- All scripts in `scripts/` referencing the website
- All `.github/workflows/` touching the website
- All docs (reviews, briefs, debriefs) primarily about the website
- Cross-references between `sgraph_ai_app_send/` and `sgraph_ai__website/`
- Ambiguous/shared items requiring a decision

## What to read in what order

If the migration agent has limited time, read in this order and stop when briefed:

1. This dev pack's `README.md` (2 min)
2. [`00_briefing-prompt.md`](00_briefing-prompt.md) (1 min)
3. [`phase_1__design/01_context-and-goals.md`](phase_1__design/01_context-and-goals.md) (3 min)
4. [`phase_2__planning/02_target-repo-structure.md`](phase_2__planning/02_target-repo-structure.md) (3 min)
5. [`phase_2__planning/03_file-inventory-and-mapping.md`](phase_2__planning/03_file-inventory-and-mapping.md) (5 min)
6. [`phase_3__development/04_migration-execution-plan.md`](phase_3__development/04_migration-execution-plan.md) (5 min)
7. [`phase_3__development/05_path-rewrites-and-cross-references.md`](phase_3__development/05_path-rewrites-and-cross-references.md) (5 min)
8. [`phase_3__development/06_ci-and-secrets.md`](phase_3__development/06_ci-and-secrets.md) (5 min)

That is about 30 minutes of reading — enough to execute the migration confidently. QA and cleanup docs ([`07`](phase_4__qa/07_smoke-tests-and-acceptance.md), [`08`](phase_5__release/08_cutover-and-cleanup.md)) are read at their respective phases, not upfront.
