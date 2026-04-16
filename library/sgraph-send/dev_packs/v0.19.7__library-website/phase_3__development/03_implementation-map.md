# Implementation Map — Library Website
**v0.19.7 | 02 April 2026**
**Phase 3: Development | Source: v0.13.5 dev-brief**

5-phase build. Phase 0 creates the repo. Phases 1-4 build in parallel where possible.
Full rendering detail: `04_rendering-and-indexing-strategy.md`

---

## Stack Reminders

- New standalone repo: `the-cyber-boardroom/SGraph-AI__Library`
- Static HTML/CSS/JS, no build step, S3 + CloudFront (eu-west-2)
- Web Components with IFD versioning (`v0/v0.1/v0.1.0/component.js`)
- Aurora design tokens: dark navy `#1A1A2E` + teal `#4ECDC4`, DM Sans, JetBrains Mono
- Content: markdown files, rendered client-side
- No Jekyll, no Hugo, no framework

---

## Phase 0 — New Repo Creation (First action)

**Create:** `the-cyber-boardroom/SGraph-AI__Library`

### 0.1 Repo structure
Commit the folder structure with stub README files:
```
SGraph-AI__Library/
  README.md
  CLAUDE.md          ← bootstrap guidance pointing at library content
  roles/README.md
  teams/README.md
  skills/README.md
  guides/README.md
  claude-guidance/README.md
  workflows/README.md
  project-index/README.md
  _site/             ← gitignored
```

### 0.2 Initial CLAUDE.md
Simple bootstrap — tells agents where everything is, points at the library.

### 0.3 GitHub repo settings
- Default branch: `main`
- Public repo (library content is not sensitive)
- Branch protection on `main` (PR required)

---

## Phase 1 — Content Migration (from SG/Send → Library repo)

### 1.1 Role definitions (16 files → `roles/`)

Copy from `team/roles/*/ROLE.md` in SG/Send. Reformat if needed:
- Normalise filename: `{role}.md` (e.g. `librarian.md`)
- Add frontmatter: `title`, `version`, `team`, `wardley_stage`
- Add to `roles/README.md` index

### 1.2 Skills (3 files → `skills/`)

Copy from `library/skills/` in SG/Send:
```
skills/create-vault-content/SKILL.md
skills/use-sgit-and-vaults/SKILL.md
skills/talk-to-team/SKILL.md
```

### 1.3 Guides (from `library/guides/` in SG/Send)

Copy stable guides: IFD methodology, testing conventions, agentic workflow.
Review each for SG/Send-specific content — remove or generalise.

### 1.4 Claude guidance (extract from `.claude/CLAUDE.md`)

Extract the sections that are shared methodology (not project-specific):
- Wardley Maps context → `claude-guidance/wardley-context.md`
- Memory policy → `claude-guidance/memory-policy.md`
- Reality document rules → `claude-guidance/reality-document-rules.md`
- Team structure rules → `claude-guidance/shared-conventions.md`
- File naming rules → `claude-guidance/shared-conventions.md`

### 1.5 New content to write

These do not exist yet. Write in the library repo:

| File | Content |
|------|---------|
| `roles/ciso.md` | CISO role definition |
| `roles/alchemist.md` | Town Planner / Alchemist role |
| `roles/explorer.md` | Explorer meta-role |
| `roles/villager.md` | Villager meta-role |
| `roles/town-planner.md` | Town Planner meta-role |
| `teams/explorer-team.md` | Roles, focus, Wardley, rules |
| `teams/villager-team.md` | Same structure |
| `teams/town-planner-team.md` | Same structure |
| `guides/issues-fs.md` | How Issues-FS works |
| `guides/clone-on-start.md` | Two-repo session bootstrap |
| `workflows/briefing-workflow.md` | Voice memo → brief → execution |
| `workflows/dev-qa-handoff.md` | Dev → QA handoff pattern |
| `workflows/debrief-workflow.md` | Debrief structure and rules |
| `workflows/patch-flow.md` | Code patch flow through teams |
| `project-index/repos.md` | All GitHub repos |
| `project-index/websites.md` | All live SGraph websites |
| `project-index/vaults.md` | Demo vaults and public vaults |

---

## Phase 2 — Website Build

### 2.1 Homepage (`index.html`)

```html
<header class="lib-header">
  <a href="/" class="lib-logo">SGraph Library</a>
  <sg-library-search></sg-library-search>  <!-- queries index.json -->
</header>

<main class="lib-home">
  <section class="hero">
    <h1>The SGraph Agentic Team Knowledge Base</h1>
    <p>Clone this repo at the start of every session.</p>
    <code>git clone https://github.com/the-cyber-boardroom/SGraph-AI__Library</code>
  </section>

  <section class="section-grid">
    <a href="./roles/" class="section-card">
      <h2>Roles</h2><p>21 role definitions</p>
    </a>
    <a href="./teams/" class="section-card">
      <h2>Teams</h2><p>Explorer · Villager · Town Planner</p>
    </a>
    <a href="./skills/" class="section-card">
      <h2>Skills</h2><p>Claude skill files</p>
    </a>
    <a href="./guides/" class="section-card">
      <h2>Guides</h2><p>IFD · Testing · Workflow</p>
    </a>
    <a href="./claude-guidance/" class="section-card">
      <h2>Claude Guidance</h2><p>Shared conventions</p>
    </a>
    <a href="./workflows/" class="section-card">
      <h2>Workflows</h2><p>Briefing · Handoffs · Release</p>
    </a>
  </section>

  <footer class="lib-meta-links">
    <a href="/index.json">index.json</a>
    <a href="/catalogue.csv">catalogue.csv</a>
    <a href="/reading-order.json">reading-order.json</a>
  </footer>
</main>
```

### 2.2 Document page template (used for all content pages)

```html
<div class="lib-layout">
  <aside class="lib-sidebar">
    <sg-library-nav current-path="{{ path }}"></sg-library-nav>
  </aside>
  <main class="lib-content">
    <sg-markdown-viewer src="/raw/{{ path }}.md"></sg-markdown-viewer>
  </main>
</div>
```

### 2.3 Print CSS

```css
@media print {
  .lib-sidebar, .lib-header nav { display: none; }
  .lib-content { max-width: 100%; margin: 0; }
  a[href]:after { content: none; } /* suppress URL printing */
  code { border: 1px solid #ccc; }
}
```

---

## Phase 3 — Index Generation

### 3.1 `generate-index.py` script

Runs on CI (every push to main). Scans all `.md` files, reads frontmatter, outputs:

- `index.json` — full index with all metadata
- `catalogue.csv` — flat version
- `reading-order.json` — per-role reading order

### 3.2 Frontmatter spec for all content files

```yaml
---
title: "Librarian"
version: "v0.19.7"
date: "2026-04-02"
roles: ["librarian", "all"]
topics: ["team-structure", "knowledge-management"]
status: "current"   # current | stale | proposed
team: "all"         # explorer | villager | town-planner | all
---
```

### 3.3 `index.json` structure

```json
{
  "generated": "2026-04-02T10:00:00Z",
  "version": "v0.19.7",
  "documents": [
    {
      "path": "roles/librarian.md",
      "raw_url": "/raw/roles/librarian.md",
      "html_url": "/roles/librarian/",
      "title": "Librarian",
      "version": "v0.19.7",
      "date": "2026-04-02",
      "roles": ["librarian", "all"],
      "topics": ["team-structure"],
      "status": "current",
      "team": "all",
      "stale": false
    }
  ]
}
```

---

## Phase 4 — Deployment

### 4.1 S3 bucket

`s3://library.sgraph.ai` (eu-west-2). Public read. Same pattern as sgraph.ai.

### 4.2 CloudFront distribution

- Origin: S3 bucket
- Default root object: `index.html`
- Custom error page: 404 → `/404.html`
- Cache: 1 hour for HTML, 1 year for versioned assets

### 4.3 CI pipeline (`.github/workflows/deploy-library.yml`)

```yaml
on: push to main
jobs:
  generate:
    - python generate-index.py      # regenerate index.json, catalogue.csv
    - commit if index changed        # only if files differ (idempotent)
  deploy:
    - aws s3 sync . s3://library.sgraph.ai --exclude ".git/*" --exclude "*.py"
    - aws cloudfront create-invalidation --distribution-id $CF_ID --paths "/*"
  smoke-test:
    - curl -sf https://library.sgraph.ai/ > /dev/null
    - curl -sf https://library.sgraph.ai/index.json > /dev/null
    - curl -sf https://library.sgraph.ai/raw/roles/librarian.md > /dev/null
```

### 4.4 DNS

`library.sgraph.ai` CNAME → CloudFront distribution domain.

---

## Phase 5 — Clone-on-Start Integration

### 5.1 Update session start hooks

In each project repo's session start configuration, add:
```bash
# Clone library repo if not present
if [ ! -d "$HOME/sgraph-library" ]; then
  git clone https://github.com/the-cyber-boardroom/SGraph-AI__Library $HOME/sgraph-library
fi
```

### 5.2 Update project CLAUDE.md files

Each project CLAUDE.md gets a `## Library` section pointing at the cloned library.

### 5.3 Update `00_briefing-prompt.md` for all dev packs

Add standard clone instruction at the top of all briefing prompts.

---

## Sequencing

```
Phase 0: Create repo + folder structure     ← do first
   ↓
Phase 1: Content migration                  ← can start immediately after Phase 0
   ↓ (parallel with Phase 2)
Phase 2: Website build                      ← can start with stubs before all content exists
   ↓
Phase 3: Index generation                   ← after enough content exists to test
   ↓
Phase 4: Deploy to library.sgraph.ai        ← after smoke tests pass
   ↓
Phase 5: Clone-on-start integration         ← after site is live
```

---

*Phase 3 Development — Implementation Map*
*v0.19.7 — 02 April 2026*
*Source: v0.13.5 dev-brief, v0.19.7 brief*
