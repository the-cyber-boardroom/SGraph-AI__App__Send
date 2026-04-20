# Definition of Done — Library Website
**v0.19.7 | 02 April 2026**
**Phase 4: QA | Source: v0.19.7 brief Acceptance Criteria**

The library website is done when all 9 acceptance criteria from the human brief are met, plus the technical checks below.

---

## 9-Item Acceptance Criteria (from brief)

- [ ] **1. Library repo created** — `the-cyber-boardroom/SGraph-AI__Library` exists with folder structure: `roles/`, `teams/`, `skills/`, `guides/`, `claude-guidance/`, `workflows/`, `project-index/`

- [ ] **2. All 21+ role definitions migrated** — Every role has a `roles/{role}.md` in the library repo with frontmatter (title, version, date, team, topics)

- [ ] **3. Team structure pages** — `teams/explorer-team.md`, `teams/villager-team.md`, `teams/town-planner-team.md` exist with: which roles belong to each team, Wardley stage, focus, rules

- [ ] **4. Skills centralised** — All skills in `skills/` (minimum: create-vault-content, use-sgit-and-vaults, talk-to-team)

- [ ] **5. Claude guidance migrated** — `claude-guidance/` contains: shared-conventions.md, wardley-context.md, memory-policy.md, reality-document-rules.md

- [ ] **6. Static website deployable to library.sgraph.ai** — CI deploys on push to `main`. S3 + CloudFront. Smoke test passes.

- [ ] **7. Runs locally from folder** — Open `index.html` from a local clone, without a web server (or with `python -m http.server`). All markdown content renders. Navigation works.

- [ ] **8. Clone-on-start tested** — Start a brand new Claude Code session. Run: `git clone https://github.com/the-cyber-boardroom/SGraph-AI__Library`. Verify all role definitions, skills, and guides are immediately readable from the cloned folder — without touching the SG/Send repo.

- [ ] **9. Cross-project reuse verified** — At least one non-SG/Send repo (e.g. SGraph-QA or SGraph-Tools) starts a session successfully using only the library repo for team knowledge. No SG/Send-specific content leaked into the library.

---

## Technical Checks

### Content quality

- [ ] All ROLE.md files have frontmatter (title, version, date, team, topics, status)
- [ ] No SG/Send-specific content in library files — library content is generic and reusable
- [ ] `roles/README.md` lists all roles with one-line descriptions
- [ ] `project-index/repos.md` lists all current SGraph repos with links

### Website functionality

- [ ] Homepage loads at `library.sgraph.ai/` with search box and 6 section cards
- [ ] All rendered URLs return 200 (`/roles/librarian/`, `/skills/create-vault-content/`, etc.)
- [ ] All `/raw/*.md` URLs return raw markdown (correct Content-Type: text/plain)
- [ ] `library.sgraph.ai/index.json` is valid JSON and contains all documents
- [ ] `library.sgraph.ai/catalogue.csv` is valid CSV
- [ ] `library.sgraph.ai/reading-order.json` is valid JSON with entries for each role
- [ ] `<sg-markdown-viewer>` renders markdown correctly (headings, tables, code blocks)
- [ ] `<sg-library-nav>` sidebar shows correct current-page highlight
- [ ] `<sg-library-search>` returns results for "librarian", "IFD", "clone-on-start"
- [ ] Print layout: sidebar hidden, content readable, code blocks styled

### CI/CD

- [ ] Push to `main` triggers deploy pipeline
- [ ] `generate-index.py` runs automatically and commits updated indexes if changed
- [ ] Smoke tests pass post-deploy: homepage, index.json, one raw markdown file

### Performance and accessibility

- [ ] Homepage loads in < 2s on 3G (markdown rendering is client-side, keep dependencies small)
- [ ] Zero cookies on all pages (verifiable in DevTools)
- [ ] All images have alt text (if any images used)
- [ ] Navigation works without JavaScript (progressive enhancement)

---

## The Clone-on-Start Test (Item 8 detail)

This is the primary acceptance test. Run in a fresh environment:

```bash
# In a new terminal, empty directory, no access to SG/Send repo
mkdir /tmp/test-session && cd /tmp/test-session

# Clone library only
git clone https://github.com/the-cyber-boardroom/SGraph-AI__Library

# Verify contents
ls SGraph-AI__Library/roles/         # should list 21 .md files
cat SGraph-AI__Library/roles/librarian.md    # should show full role definition
cat SGraph-AI__Library/guides/ifd-methodology.md  # should show IFD guide
cat SGraph-AI__Library/skills/talk-to-team/SKILL.md  # should show skill

# Verify indexes
curl https://library.sgraph.ai/index.json | python -c "import json,sys; d=json.load(sys.stdin); print(f'{len(d[\"documents\"])} documents indexed')"
# Expected: "42 documents indexed" (or similar)
```

**Pass condition:** An agent can begin a session knowing the full team structure, all role definitions, and all methodology — without accessing SG/Send at all.

---

*Phase 4 QA — Definition of Done*
*v0.19.7 — 02 April 2026*
*Source: v0.19.7 brief Acceptance Criteria*
