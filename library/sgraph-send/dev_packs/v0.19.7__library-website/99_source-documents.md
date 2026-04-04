# Source Documents Index — Library Website
**v0.19.7 | 02 April 2026**
**Maintained by:** Librarian

All source documents that fed into this dev pack.

---

## Human Briefs

| Document | Path | Key content |
|----------|------|-------------|
| **Latest brief** (authoritative) | `team/humans/dinis_cruz/briefs/04/02/v0.19.7__brief__library-website.md` | Full system vision: what the library is, clone-on-start pattern, migration table, 9 acceptance criteria, Designer's brief |
| **Technical architecture brief** | `team/humans/dinis_cruz/briefs/03/09/v0.13.5__dev-brief__library-website.md` | Two audiences (human + LLM), markdown-first rendering, Web Components, machine-readable indexes, 11 acceptance criteria, curation pipeline |
| **Daily brief mentioning library** | `team/humans/dinis_cruz/briefs/04/02/v0.19.7__daily-brief__sgraph-send-02-apr-2026.md` | Library listed as "Design" stage signal; clone-on-start listed as "Architecture" stage |

---

## Librarian Reviews and Inventory

| Document | Path | Key content |
|----------|------|-------------|
| **Library inventory audit** | `team/humans/dinis_cruz/briefs/03/09/v0_13_6__debrief__library-inventory.md` | 258 markdown files (Mar 2026 count), staleness assessment per section, recommendations |
| **Reality document** | `team/roles/librarian/reality/` (single file) | Code-verified record of everything that actually exists in the project |

---

## Content to Migrate (Source files in SG/Send)

### Role definitions (16 files)
```
team/roles/advocate/ROLE__Advocate.md
team/roles/ambassador/ROLE__Ambassador.md
team/roles/appsec/ROLE.md
team/roles/architect/ROLE.md
team/roles/cartographer/ROLE.md
team/roles/conductor/ROLE.md
team/roles/designer/ROLE.md
team/roles/dev/ROLE.md
team/roles/devops/ROLE.md
team/roles/dpo/ROLE.md
team/roles/grc/ROLE.md
team/roles/historian/ROLE.md
team/roles/journalist/ROLE.md
team/roles/librarian/ROLE.md
team/roles/qa/ROLE.md
team/roles/sherpa/ROLE__Sherpa.md
```

### Skills (3 files)
```
library/skills/create-vault-content/SKILL.md
library/skills/use_sgit-and-vaults/SKILL.md
library/skills/talk-to-team__send/SKILL.md
```

### Claude guidance (extract from these files)
```
.claude/CLAUDE.md                    ← shared sections: memory policy, reality doc rules,
                                       Wardley framing, team structure, naming conventions
.claude/explorer/CLAUDE.md           ← Explorer-specific methodology
.claude/villager/CLAUDE.md           ← Villager-specific methodology
.claude/town-planner/CLAUDE.md       ← Town Planner-specific methodology
```

### Guides (from library/)
```
library/guides/development/ifd/      ← IFD methodology
library/guides/development/          ← testing conventions, agentic workflow
```

---

## Related Dev Packs (cross-reference)

| Dev pack | Path | Relevance |
|----------|------|-----------|
| Website redesign | `library/sgraph-send/dev_packs/v0.18.2__sgraph-ai-website-redesign/` | `<sg-markdown-viewer>` is a shared component; shared header/footer also relevant |
| Bootstrap packs | `library/sgraph-send/dev_packs/` (8 packs) | Model for what the library repo's dev packs should look like |

---

## Key Decisions Quick Reference

| Decision | Non-negotiable? |
|----------|----------------|
| Standalone repo (`SGraph-AI__Library`) — not a subfolder of SG/Send | Yes |
| Markdown source of truth — no CMS | Yes |
| Client-side rendering via `<sg-markdown-viewer>` — no Jekyll/Hugo | Yes |
| Dual format: HTML for humans, raw markdown URLs for LLMs | Yes |
| Machine-readable indexes at root (`index.json`, `catalogue.csv`) | Yes |
| Library is NOT SG/Send-specific — cross-project reuse | Yes |
| Aurora design tokens (dark navy + teal) | Yes |
| Zero cookies | Yes |
| Clone-on-start pattern is the primary deliverable — website is the human view | Yes |

---

## What Does NOT Exist Yet (PROPOSED — must not be claimed as shipped)

- `SGraph-AI__Library` repo — **PROPOSED**
- `library.sgraph.ai` website — **PROPOSED**
- `<sg-markdown-viewer>` Web Component — **PROPOSED**
- `<sg-library-nav>` Web Component — **PROPOSED**
- `<sg-library-search>` Web Component — **PROPOSED**
- Team structure pages (`teams/*.md`) — **PROPOSED**
- Workflow docs (`workflows/*.md`) — **PROPOSED**
- Project index (`project-index/*.md`) — **PROPOSED**
- `index.json` / `catalogue.csv` generation script — **PROPOSED**
- Clone-on-start integration in project repos — **PROPOSED**

---

*Source Documents Index*
*v0.19.7 — 02 April 2026*
