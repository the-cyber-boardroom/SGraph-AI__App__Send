# Dev Pack — sgraph.ai Website Redesign
**Version:** v0.18.2 | **Date:** 27 March 2026
**Status:** Planning complete. Dev Phase 1 ready to start.
**Branch:** `claude/sgraph-website-planning-aZubw`

This folder is the **single source of truth** for the sgraph.ai website redesign. Use it to brief any new Claude Code session, Claude Web session, or team member — without hunting across the repo.

---

## TL;DR (30 seconds)

We are redesigning [sgraph.ai](https://sgraph.ai) to reflect what v0.3.0 actually is.

**The problem with the current site:**
- Shows zero product screenshots
- Ignores the highest-volume visitor (the file recipient)
- Leads with "Built by AI agents" instead of the actual differentiator
- Has pages that hurt more than help (/agents/, /architecture/)

**The differentiator we're not showing:**
> "The only encrypted file sharing tool where recipients browse, view, and interact with content — without downloading it, without an account, and without us ever being able to read it."

**What we're building:**
- Homepage with live product demo (`<sg-public-viewer>`), gallery screenshots, visible 6-sentence privacy policy
- `/features/` — all v0.3.0 capabilities with screenshots
- `/security/` — replaces /architecture/ with CISO-depth trust page
- 5x `/why/` workflow landing pages
- Tools in nav + "Already have a token? →" link in header
- Web Components from `SGraph-AI__Tools` repo throughout

---

## Reading Order (for a new session)

| Step | File | Time | Purpose |
|------|------|------|---------|
| **Start here** | [`00_briefing-prompt.md`](00_briefing-prompt.md) | 2 min | Copy-paste to start a new Claude Code/Web session |
| 1 | [`phase_1__design/01_context-and-brand.md`](phase_1__design/01_context-and-brand.md) | 5 min | What the product is, what's settled, what we claim |
| 2 | [`phase_2__planning/02_decisions-and-site-map.md`](phase_2__planning/02_decisions-and-site-map.md) | 8 min | All decisions made, new site structure, homepage copy |
| 3 | [`phase_3__development/03_implementation-map.md`](phase_3__development/03_implementation-map.md) | 10 min | 7 phases, file paths, HTML/CSS sketches |
| 4 | [`phase_3__development/04_tools-repo-strategy.md`](phase_3__development/04_tools-repo-strategy.md) | 5 min | Web Components, __Tools repo, static.sgraph.ai |
| 5 | [`phase_4__qa/05_definition-of-done.md`](phase_4__qa/05_definition-of-done.md) | 3 min | What "done" means — 13-item checklist |
| 6 | [`phase_5__release/06_launch-checklist.md`](phase_5__release/06_launch-checklist.md) | 3 min | Pre-launch verification and messaging |
| Deep dive | [`99_source-documents.md`](99_source-documents.md) | — | Full role reviews and source briefs |

---

## Folder Structure

```
v0.18.2__sgraph-ai-website-redesign/
  README.md                         ← This file (entry point)
  00_briefing-prompt.md             ← Copy-paste to start a new session
  phase_1__design/
    01_context-and-brand.md         ← Product reality, brand, competitive
  phase_2__planning/
    02_decisions-and-site-map.md    ← All decisions, site map, copy, messaging
  phase_3__development/
    03_implementation-map.md        ← 7-phase build plan with code sketches
    04_tools-repo-strategy.md       ← Web Components + __Tools integration
  phase_4__qa/
    05_definition-of-done.md        ← 13-item checklist + QA site strategy
  phase_5__release/
    06_launch-checklist.md          ← Pre-launch steps + v0.3.0 messaging
  99_source-documents.md            ← Index of all source documents in repo
```

---

## Current Status by Phase

| Phase | Status | Owner | Notes |
|-------|--------|-------|-------|
| Phase 1: Design | ✅ Complete | Designer/Ambassador/Sherpa | Reviews written 27 Mar |
| Phase 2: Planning | ✅ Complete | Conductor | Brief written 27 Mar |
| Phase 3: Development | 🔲 Ready to start | Developer | Awaiting screenshots from Dinis |
| Phase 4: QA | 🔲 Not started | QA | Will run after Phase 3 PR 1 |
| Phase 5: Release | 🔲 Not started | DevOps/Ambassador | After QA sign-off |

**Blocker for Phase 3:** 8 product screenshots + 3 demo vaults (Dinis will share via SG/Send vault).

---

## Key Decisions (non-negotiable)

1. **North star:** "Encrypted + browsable + server never sees"
2. **Hero:** "Share files. Browse them. Nobody can read them. Not even us."
3. **"Cannot" not "will not"** — everywhere, always
4. **Six-sentence privacy policy visible on homepage** (not linked)
5. **No test count stats** — spans multiple repos, misleading without context
6. **Proton Drive also has client-side E2EE** — our edge is browsing UX + no-account
7. **One place for shared code** — sgraph.ai owns master banner; __Tools is master for tools
8. **Deploy /security/ BEFORE removing /architecture/** — SEO continuity
9. **PR 1 adds everything; PR 2 removes old pages** — never remove before replacement is indexed

---

*Single source of truth for the sgraph.ai website redesign*
*Last updated: 27 March 2026 | Branch: `claude/sgraph-website-planning-aZubw`*
