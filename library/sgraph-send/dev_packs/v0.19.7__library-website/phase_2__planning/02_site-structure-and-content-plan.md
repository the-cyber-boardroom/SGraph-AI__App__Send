# Site Structure and Content Plan — Library Website
**v0.19.7 | 02 April 2026**
**Phase 2: Planning | Sources: v0.13.5 brief, v0.19.7 brief, Librarian inventory**

All decisions in this document are settled. Reopen only with a new Conductor brief.

---

## New Repo: `SGraph-AI__Library`

A standalone Git repo — not a subfolder of SG/Send. This is intentional.

**Why standalone:** Other projects (SGraph-QA, SGraph-Tools, future) need to clone it independently. A subfolder of SG/Send cannot be cloned separately.

**Repo name:** `the-cyber-boardroom/SGraph-AI__Library`
**Website:** `library.sgraph.ai`
**Deploy:** S3 + CloudFront (eu-west-2), same pattern as sgraph.ai
**No build step:** Static HTML/CSS/JS deployed as-is

---

## Library Repo Folder Structure

```
SGraph-AI__Library/
│
├── README.md                    ← "What this repo is, how to use it"
├── CLAUDE.md                    ← Shared guidance for all agent sessions
│
├── roles/                       ← One file per role
│   ├── README.md                ← Index of all roles
│   ├── conductor.md
│   ├── librarian.md
│   ├── architect.md
│   ├── developer.md
│   ├── designer.md
│   ├── sherpa.md
│   ├── qa.md
│   ├── devops.md
│   ├── ambassador.md
│   ├── journalist.md
│   ├── appsec.md
│   ├── cartographer.md
│   ├── historian.md
│   ├── advocate.md
│   ├── dpo.md
│   ├── grc.md
│   ├── ciso.md                  ← to be defined (currently undocumented)
│   ├── alchemist.md             ← to be defined (Town Planner lead)
│   ├── explorer.md              ← meta-role definition
│   ├── villager.md              ← meta-role definition
│   └── town-planner.md          ← meta-role definition
│
├── teams/                       ← Team structure pages
│   ├── README.md
│   ├── explorer-team.md         ← Roles, focus, Wardley stage, rules
│   ├── villager-team.md
│   └── town-planner-team.md
│
├── skills/                      ← Claude skill files
│   ├── README.md
│   ├── create-vault-content/
│   │   └── SKILL.md
│   ├── use-sgit-and-vaults/
│   │   └── SKILL.md
│   ├── talk-to-team/
│   │   └── SKILL.md
│   └── [new skills as needed]
│
├── guides/                      ← Methodology and how-to guides
│   ├── README.md
│   ├── ifd-methodology.md       ← Idempotent File Deployment
│   ├── testing-conventions.md   ← No mocks, Type_Safe, in-memory stack
│   ├── agentic-workflow.md      ← How briefings, patches, handoffs work
│   ├── file-naming.md           ← Version prefix, review paths, debrief paths
│   ├── issues-fs.md             ← How Issues-FS works (flat file task board)
│   └── clone-on-start.md        ← The two-repo session bootstrap pattern
│
├── claude-guidance/             ← Shared CLAUDE.md content (cross-project)
│   ├── README.md
│   ├── shared-conventions.md    ← "cannot" not "will not", no em dashes, etc.
│   ├── wardley-context.md       ← Explorer/Villager/Town Planner framing
│   ├── memory-policy.md         ← No MEMORY.md, use Librarian docs
│   └── reality-document-rules.md ← Non-negotiable rules for reality docs
│
├── workflows/                   ← Process documentation
│   ├── README.md
│   ├── briefing-workflow.md     ← Voice memo → brief → agent execution
│   ├── dev-qa-handoff.md        ← How Dev hands off to QA
│   ├── patch-flow.md            ← How code patches flow through teams
│   ├── debrief-workflow.md      ← How debriefs are created and structured
│   └── release-workflow.md      ← Explorer → Villager → production
│
├── project-index/               ← Map of the entire SGraph project
│   ├── README.md
│   ├── repos.md                 ← All GitHub repos
│   ├── websites.md              ← All live websites
│   └── vaults.md                ← Demo vaults and public vaults
│
└── _site/                       ← Generated website (gitignored, built on push)
    └── [static HTML/CSS/JS output]
```

---

## Website Site Map

| URL | Content | Audience |
|-----|---------|----------|
| `library.sgraph.ai/` | Homepage — search + section index | Human + LLM |
| `library.sgraph.ai/roles/` | Role index page | Human |
| `library.sgraph.ai/roles/{role}/` | Individual role definition | Human |
| `library.sgraph.ai/teams/` | Team structures index | Human |
| `library.sgraph.ai/teams/{team}/` | Team detail page | Human |
| `library.sgraph.ai/skills/` | Skills index | Human |
| `library.sgraph.ai/skills/{skill}/` | Skill definition | Human |
| `library.sgraph.ai/guides/` | Guides index | Human |
| `library.sgraph.ai/guides/{guide}/` | Individual guide | Human |
| `library.sgraph.ai/claude-guidance/` | Shared CLAUDE.md content | Human + LLM |
| `library.sgraph.ai/workflows/` | Process docs index | Human |
| `library.sgraph.ai/project-index/` | All repos, sites, vaults | Human |
| `library.sgraph.ai/raw/roles/{role}.md` | Raw markdown for LLMs | LLM |
| `library.sgraph.ai/raw/guides/{guide}.md` | Raw markdown for LLMs | LLM |
| `library.sgraph.ai/index.json` | Full content index (machine-readable) | LLM |
| `library.sgraph.ai/catalogue.csv` | Flat catalogue (machine-readable) | LLM |
| `library.sgraph.ai/reading-order.json` | Recommended reading order per role | LLM |

---

## Content Migration Plan

### What migrates from SG/Send repo → Library repo

| Source (SG/Send) | Destination (Library) | Action |
|-----------------|----------------------|--------|
| `team/roles/*/ROLE.md` (16 files) | `roles/` | Copy + reformat if needed |
| `.claude/CLAUDE.md` shared sections | `claude-guidance/` | Extract and copy |
| `.claude/explorer/CLAUDE.md` methodology sections | `claude-guidance/wardley-context.md` | Extract |
| `library/guides/` (IFD, testing, agentic workflow) | `guides/` | Move as-is |
| `library/skills/` (3 skills) | `skills/` | Move as-is |
| `.claude/CLAUDE.md` memory policy section | `claude-guidance/memory-policy.md` | Extract |
| `.claude/CLAUDE.md` reality doc rules | `claude-guidance/reality-document-rules.md` | Extract |

### What stays in SG/Send repo (project-specific)

| Content | Why it stays |
|---------|-------------|
| `team/roles/*/reviews/` | Project-specific review output |
| `team/humans/dinis_cruz/briefs/` | Project-specific, date-bucketed |
| `team/roles/librarian/reality/` | Project-specific reality doc |
| `library/sgraph-send/dev_packs/` | Project-specific dev packs |
| `library/alchemist/` | Project-specific investor materials |
| `library/dependencies/` | SG/Send-specific dependency guides |
| `.claude/CLAUDE.md` (project sections) | Stack config, repo structure, version file |

### What needs to be CREATED (doesn't exist yet)

| New content | Location | Notes |
|-------------|----------|-------|
| ciso.md | `roles/` | Role definition doesn't exist yet |
| alchemist.md | `roles/` | Town Planner lead role definition |
| explorer.md, villager.md, town-planner.md | `roles/` | Meta-role definitions |
| `teams/*.md` (3 files) | `teams/` | Team structure pages |
| `workflows/*.md` (5 files) | `workflows/` | Process docs |
| `project-index/*.md` (3 files) | `project-index/` | Map of all repos/sites/vaults |
| `guides/issues-fs.md` | `guides/` | Issues-FS how-to |
| `guides/clone-on-start.md` | `guides/` | Two-repo pattern |

---

## Homepage Design

The homepage is a **reference tool**, not a marketing page. Visitors are agents and team members.

**Priority:** Find any role, skill, or guide in < 10 seconds.

```
[HEADER]
  SGraph Library | library.sgraph.ai
  [Search box — client-side, queries index.json]

[HERO — one paragraph]
  "The centralised knowledge base for the SGraph agentic team.
   Clone this repo at the start of every session."
  [Clone button: git clone github.com/the-cyber-boardroom/SGraph-AI__Library]

[SECTION GRID — 6 cards]
  Roles (21)          Teams (3)          Skills (3+)
  Guides (7+)         Claude Guidance    Workflows (5+)

[FOOTER]
  Raw index: /index.json  |  Catalogue: /catalogue.csv
  GitHub | library.sgraph.ai/raw/
```

---

## Navigation Sidebar (all non-home pages)

```
Roles          ← expandable: lists all 21 roles alphabetically
Teams
  Explorer
  Villager
  Town Planner
Skills
Guides
Claude Guidance
Workflows
Project Index
─────────────
Raw index  ↗  (index.json)
Catalogue  ↗  (catalogue.csv)
```

---

## LLM-Optimised Delivery

Every document has two access patterns:

| Pattern | URL | Use |
|---------|-----|-----|
| Human | `library.sgraph.ai/roles/librarian/` | Rendered HTML |
| LLM | `library.sgraph.ai/raw/roles/librarian.md` | Raw markdown |

The root indexes:

| File | Contents |
|------|---------|
| `index.json` | All documents: path, title, version, date, roles, topics, status, staleness flag |
| `catalogue.csv` | Flat version of index.json (Excel-friendly) |
| `reading-order.json` | Per-role recommended reading order (`{"librarian": ["roles/librarian.md", "guides/issues-fs.md", ...]}`) |

**Claude session startup with library:**
```python
# In session start hook or briefing:
# 1. Fetch index: GET library.sgraph.ai/index.json
# 2. Filter by relevant topics
# 3. Fetch raw markdown for each relevant doc
# Total: ~3 HTTP requests, ~5KB of content, < 1 second
```

---

## Shared CLAUDE.md Pattern

After the library is live, project CLAUDE.md files become thin:

```markdown
# SG/Send — Agent Guidance

## Library
This project uses the SGraph Library. Clone it at the start of every session:
  git clone github.com/the-cyber-boardroom/SGraph-AI__Library

Role definitions, team structures, skills, and shared methodology live there.
Read library/claude-guidance/ for shared conventions.

## Project-Specific
[Only SG/Send-specific content below: repo structure, stack, version file, etc.]
```

---

*Phase 2 Planning — Site Structure and Content Plan*
*v0.19.7 — 02 April 2026*
*Sources: v0.13.5 dev-brief, v0.19.7 brief, Librarian inventory (v0.13.6)*
