# Launch Checklist — Library Website
**v0.19.7 | 02 April 2026**
**Phase 5: Release**

---

## Pre-Launch (Must complete before library.sgraph.ai goes live)

### Repo and content
- [ ] `SGraph-AI__Library` repo created on GitHub
- [ ] All 21 role definitions committed
- [ ] Team structure pages (3 files) committed
- [ ] Skills (3 minimum) committed
- [ ] Claude guidance (4 files) committed
- [ ] At least 3 workflow docs committed
- [ ] `project-index/` committed (repos, websites, vaults)
- [ ] `index.json` and `catalogue.csv` generated and committed
- [ ] All 9 DoD items checked

### Infrastructure
- [ ] S3 bucket `library.sgraph.ai` created (eu-west-2)
- [ ] CloudFront distribution configured (HTTPS, `library.sgraph.ai` domain)
- [ ] DNS CNAME set: `library.sgraph.ai` → CloudFront domain
- [ ] CI/CD pipeline in place (deploy on push to `main`)
- [ ] `generate-index.py` runs automatically in CI

### Smoke tests
- [ ] `https://library.sgraph.ai/` returns 200
- [ ] `https://library.sgraph.ai/roles/librarian/` returns 200
- [ ] `https://library.sgraph.ai/raw/roles/librarian.md` returns raw markdown
- [ ] `https://library.sgraph.ai/index.json` returns valid JSON
- [ ] Zero cookies (open DevTools → Application → Cookies)

---

## Clone-on-Start Integration (after library is live)

The library only delivers value when sessions actually use it. This is the adoption phase.

### Update all project repos
- [ ] **SG/Send** — update `.claude/CLAUDE.md` to add `## Library` section with clone instruction
- [ ] **SGraph-QA** — same update
- [ ] **SGraph-Tools** — same update
- [ ] Test: start fresh Claude Code session in each repo, verify library is cloned and accessible

### Update session start hooks
- [ ] Add library clone to `~/.claude/stop-hook-git-check.sh` or equivalent
- [ ] Test: new Claude Web session, upload library zip — verify all content accessible

### Update all briefing prompts
- [ ] Add "Clone the library repo" instruction to all `00_briefing-prompt.md` files in dev packs
- [ ] Add library URL to CLAUDE.md files across all project repos

---

## Post-Launch — Town Planner Adoption Phase

These happen after the library is live and tested:

- [ ] **SG/Send CLAUDE.md slim-down** — remove content that now lives in library; replace with library references
- [ ] **QA site references library** — qa.send.sgraph.ai can link to library.sgraph.ai for methodology docs
- [ ] **Weekly Librarian curation** — first curation cycle: review staleness flags, update as needed
- [ ] **Validate: cross-project** — spin up a completely new project using only the library

---

## What This is NOT

- ❌ Not a full SG/Send CLAUDE.md replacement — project-specific content stays
- ❌ Not a dynamic site — no CMS, no server-side rendering, no database
- ❌ Not a search engine — client-side search over index.json only
- ❌ Not a translation project — English only at launch
- ❌ Not a skills marketplace — just the canonical location for existing skills

---

*Phase 5 Release — Launch Checklist*
*v0.19.7 — 02 April 2026*
