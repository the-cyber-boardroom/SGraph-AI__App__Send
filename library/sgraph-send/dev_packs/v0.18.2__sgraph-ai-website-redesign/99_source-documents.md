# Source Documents Index — sgraph.ai Website Redesign
**v0.18.2 | 27 March 2026**
**Maintained by:** Librarian

All source documents that fed into this dev pack. Use this to dive deeper on any topic covered in the phase files.

---

## Human Input

| Document | Path | Contents |
|----------|------|---------|
| **Master brief** | `team/humans/dinis_cruz/briefs/03/27/v0.16.62__brief__website-redesign-sgsend-v030.md` | Human brief that initiated the session. Defines scope: redesign sgraph.ai to reflect v0.3.0, especially gallery/folder/SgPrint viewer experience. |
| **Perplexity competitive research (raw)** | `team/humans/dinis_cruz/briefs/03/27/perplexity__27-mar-2026__competive-research.md` | Raw Perplexity AI research captured 27 March 2026 on competitive claims. Primary source for competitive positioning. |

---

## Librarian

| Document | Path | Contents |
|----------|------|---------|
| **Briefing pack** | `team/roles/librarian/reviews/03/27/v0.18.1__briefing-pack__website-redesign-for-v030-launch.md` | Synthesis of 38+ briefs from 01–27 March 2026. Product state, brand decisions, 4 target audiences, competitive table, proposed site structure, key messaging, demo strategy, design principles, content assignments per role. Read before the individual role reviews. |
| **Competitive research** | `team/roles/librarian/reviews/03/27/v0.18.2__competitive-research__perplexity-27-mar-2026.md` | Evidence base for all competitive claims. 8 verified claims with source URLs, recommended on-site comparison table, what NOT to claim, future `/compare/` page concept. Attribution: Perplexity AI, 27 March 2026. |
| **Reality document** | `team/roles/librarian/reality/` (single file, updated in-place) | Code-verified record of every endpoint, UI page, test, and feature that actually exists. Always check before making feature claims. |

---

## Role Reviews

| Role | Document | Path | Key outputs |
|------|----------|------|-------------|
| **Conductor** | Conductor brief | `team/roles/conductor/reviews/03/27/v0.18.2__conductor-brief__website-redesign-implementation.md` | Single authoritative decision document. North star, homepage copy (final), navigation, 8 screenshots, 3 demo vaults, competitive table, QA site integration, 14-item definition of done. |
| **Developer** | Implementation map | `team/roles/dev/reviews/03/27/v0.18.2__dev-review__website-redesign-implementation-map.md` | 7-phase build plan with exact file paths and HTML/CSS/JS code sketches. PR structure. Open questions for Dinis. |
| **Developer** | Tools repo strategy | `team/roles/dev/reviews/03/27/v0.18.2__dev-review__tools-repo-integration-strategy.md` | How sgraph.ai uses/maintains/publishes to SGraph-AI__Tools. Ownership model, component inventory, IFD versioning, consumption model, sequencing. |
| **Designer** | Designer review | `team/roles/designer/reviews/03/27/v0.17.2__designer-review__website-redesign.md` | Current design audit, section-by-section homepage layout (ASCII diagrams), 8 screenshots spec, component inventory (keep/redesign/new), missing CSS tokens, mobile-first decisions, competitive visual positioning. |
| **Sherpa** | Sherpa review | `team/roles/sherpa/reviews/03/27/v0.17.2__sherpa-review__website-redesign.md` | 3 user journey audits (Recipient/Evaluator/Investor), 4 voice principles, trust signals, content removal decisions, 5 `/why/` page outlines, homepage copy proposals, i18n notes. |
| **Architect** | Architect review | `team/roles/architect/reviews/03/27/v0.17.2__architect-review__website-redesign.md` | Current IA audit, content removal rationale, full proposed site map table, locale/i18n architecture, feature-to-page mapping, `<sg-public-viewer>` architecture, SEO gaps, tools.sgraph.ai recommendation, 10-item migration risk register. |
| **Ambassador** | Ambassador review | `team/roles/ambassador/reviews/03/27/v0.17.2__ambassador-review__website-redesign.md` | Positioning audit, competitive gap analysis, audience ranking (Recipient 70%), "AI-built" story reframe, 7 hero options, brand personality (5 traits), social proof hierarchy, v0.3.0 launch messaging (tweet thread). |

---

## Session Index and Debriefs

| Document | Path | Contents |
|----------|------|---------|
| **Session index** | `team/humans/dinis_cruz/debriefs/03/27/v0.18.2__debrief__website-redesign-session-index.md` | Master index of all 10 documents from the 27 March 2026 planning session. Reading order, key decisions table, what's next. |

---

## Key Decisions (Quick Reference)

| Decision | Non-negotiable? |
|----------|----------------|
| North star: "encrypted + browsable + server never sees" | Yes |
| Hero headline: "Share files. Browse them. Nobody can read them. Not even us." | Yes |
| "Cannot" not "will not" everywhere | Yes |
| Six-sentence privacy policy VISIBLE on homepage body | Yes |
| No test count numbers (spans multiple repos, misleading) | Yes |
| Deploy /security/ BEFORE removing /architecture/ | Yes |
| Proton Drive also has client-side E2EE — our edge is browsing UX + no-account | Yes |
| One place for shared code — sgraph.ai owns master banner, publishes to __Tools | Yes |
| All Web Components follow IFD versioning | Yes |
| PR 1 adds everything new; PR 2 (after indexing) removes old pages | Yes |
| qa.send.sgraph.ai is the proof layer — every sgraph.ai claim links there | Yes |
| Tools as top-level nav item | Yes |
| "Already have a token? →" persistent header link | Yes |

---

## What Doesn't Exist Yet (Must Not Be Claimed)

Check the reality document before making any of these claims:

- `<sg-public-viewer>` Web Component — **PROPOSED** — does not exist yet
- `/security/` page — **PROPOSED** — does not exist yet
- `/features/` page — **PROPOSED** — does not exist yet
- `/why/*` pages — **PROPOSED** — do not exist yet
- 8 product screenshots — **PROPOSED** — not yet in repo
- 3 demo vaults at send.sgraph.ai — **PROPOSED** — not yet created
- `<sg-site-header>` and `<sg-site-footer>` Web Components — **PROPOSED**
- `static.sgraph.ai` versioning channel — status unknown (check with DevOps)

---

*Source Documents Index*
*v0.18.2 — 27 March 2026*
*Last updated: 27 March 2026 | Branch: `claude/sgraph-website-planning-aZubw`*
