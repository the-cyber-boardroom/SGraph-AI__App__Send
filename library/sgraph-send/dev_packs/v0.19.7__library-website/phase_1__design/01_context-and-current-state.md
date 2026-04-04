# Context and Current State — Library Website
**v0.19.7 | 02 April 2026**
**Phase 1: Design | Sources: Librarian research, v0.13.5 brief, v0.19.7 brief**

---

## The Problem in One Sentence

> "The content exists. The discoverability doesn't."
> — v0.13.5 Dev Brief, 9 March 2026

326 markdown files containing role definitions, skills, team structures, guides, and methodology sit in the SG/Send repo — inaccessible to other projects, hard to navigate, and re-discovered from scratch every new Claude session.

---

## What Exists Now (Code-Verified)

### The `library/` folder in this repo

| Subfolder | Files | Content | Stability |
|-----------|-------|---------|-----------|
| `library/alchemist/` | ~20 | Investor/business materials, pitch content | Stale (v0.5.8, Feb 2026) |
| `library/dependencies/` | ~30 | LLM guides for osbot-utils, osbot-aws, Memory-FS, Issues-FS | Mostly current |
| `library/docs/` | ~15 | Original specs (6 docs) + catalogue | Stale (v0.1.1, Feb 2026) |
| `library/guides/` | ~25 | IFD methodology, testing, agentic workflow, markdown authoring | Current — actively used |
| `library/roadmap/` | ~10 | Phase planning (Phase 1–11+) | Stale (original planning) |
| `library/sgraph-send/` | ~200 | Dev packs (8), file research, incidents (4), release pack | Mostly current |
| `library/skills/` | 3 | Claude skills: vault-content, sgit-and-vaults, talk-to-team | Current |

**Total: ~326 markdown files**

### Role definitions

16 ROLE.md files exist in `team/roles/`:

| Role | File |
|------|------|
| advocate | `team/roles/advocate/ROLE__Advocate.md` |
| ambassador | `team/roles/ambassador/ROLE__Ambassador.md` |
| appsec | `team/roles/appsec/ROLE.md` |
| architect | `team/roles/architect/ROLE.md` |
| cartographer | `team/roles/cartographer/ROLE.md` |
| conductor | `team/roles/conductor/ROLE.md` |
| designer | `team/roles/designer/ROLE.md` |
| dev | `team/roles/dev/ROLE.md` |
| devops | `team/roles/devops/ROLE.md` |
| dpo | `team/roles/dpo/ROLE.md` |
| grc | `team/roles/grc/ROLE.md` |
| historian | `team/roles/historian/ROLE.md` |
| journalist | `team/roles/journalist/ROLE.md` |
| librarian | `team/roles/librarian/ROLE.md` |
| qa | `team/roles/qa/ROLE.md` |
| sherpa | `team/roles/sherpa/ROLE__Sherpa.md` |

**Note:** The v0.19.7 brief mentions "21+ roles". 5 additional roles (ciso, town-planner/alchemist, villager, explorer, sherpa/advocate variants) may need to be defined or consolidated.

### Claude guidance files

| File | Scope |
|------|-------|
| `.claude/CLAUDE.md` | Shared — all teams |
| `.claude/explorer/CLAUDE.md` | Explorer team sessions |
| `.claude/villager/CLAUDE.md` | Villager team sessions |
| `.claude/town-planner/CLAUDE.md` | Town Planner sessions |

The shared parts (methodology, Wardley stages, team structure) belong in the library. Project-specific parts (repo structure, version file location, stack specifics) stay in the project repo.

### Skills

| Skill | File | Purpose |
|-------|------|---------|
| `create-vault-content` | `library/skills/create-vault-content/SKILL.md` | Authoring content for SG/Send vaults |
| `use_sgit-and-vaults` | `library/skills/use_sgit-and-vaults/SKILL.md` | Using SGit vault operations |
| `talk-to-team__send` | `library/skills/talk-to-team__send/SKILL.md` | Bootstrap a team conversation session |

---

## The Two Audiences

### Audience 1: Humans
- **Who:** Dinis, agent teams, external collaborators
- **Need:** Browse role definitions, find skills, read methodology guides
- **Format:** Rendered HTML with sidebar navigation, search, print-friendly
- **URL pattern:** `library.sgraph.ai/roles/librarian/`

### Audience 2: LLMs (Claude sessions)
- **Who:** Claude Code sessions, Claude Web sessions at the start of work
- **Need:** Read raw markdown directly; no HTML parsing; predictable URLs
- **Format:** Raw markdown at `/raw/...` paths; JSON indexes for discovery
- **URL pattern:** `library.sgraph.ai/raw/roles/librarian/ROLE.md`
- **Discovery:** `library.sgraph.ai/index.json`, `library.sgraph.ai/catalogue.csv`

This dual-format requirement drives the entire architecture. Every document is available in both forms.

---

## What Belongs in the Library vs. What Stays in Project Repos

### Library (stable, cross-project)

| Content | Current location | Library destination |
|---------|-----------------|---------------------|
| Role definitions (16 ROLE.md files) | `team/roles/*/ROLE.md` | `library/roles/` |
| Team structure docs (Explorer/Villager/Town Planner) | `.claude/*.md` shared sections | `library/teams/` |
| Skills | `library/skills/` | `library/skills/` (same) |
| Methodology guides (IFD, testing, agentic workflow) | `library/guides/` | `library/guides/` (same) |
| Shared Claude guidance (methodology, Wardley, conventions) | `.claude/CLAUDE.md` shared sections | `library/claude-guidance/` |
| Workflow documentation | Scattered/undocumented | `library/workflows/` (new) |
| Project index (map of all repos/sites/vaults) | Does not exist | `library/project-index/` (new) |

### Stays in project repo (project-specific, changes often)

| Content | Reason |
|---------|--------|
| Daily briefs (`team/humans/dinis_cruz/briefs/`) | Project-specific, date-bucketed |
| Role reviews (`team/roles/*/reviews/`) | Project-specific output |
| Reality documents | Project-specific, frequently updated |
| Dev packs (`library/sgraph-send/dev_packs/`) | Project-specific |
| Debriefs | Project-specific |
| Version file, stack config | Project-specific |
| Project-specific CLAUDE.md sections | Project-specific |

---

## What Changes Infrequently (the library's mandate)

The library contains things that stay stable across months:
- **Role definitions** — who the Librarian is, what the Architect does, how the QA role works
- **Team structures** — which roles belong to Explorer vs. Villager vs. Town Planner
- **Skills** — Claude prompts that configure behaviour for specific tasks
- **Methodology** — IFD, Type_Safe conventions, "no mocks" testing rule, file naming
- **Wardley context** — Genesis/Custom-Built/Product/Commodity framing
- **Shared conventions** — "cannot" not "will not", version prefix naming, em dash rule

These do not change per-sprint. When they do change, it's a deliberate decision, not a side effect.

---

## The Clone-on-Start Pattern

Current session bootstrap (inefficient):
```
Session starts → agent reads CLAUDE.md → agent searches for role definition
→ agent reads briefing pack → agent is finally ready → 10-20 minutes lost
```

Target session bootstrap (library pattern):
```
Session starts → clones library repo + project repo
→ library/roles/, library/skills/, library/guides/ immediately available
→ project CLAUDE.md references library for shared content
→ agent is ready in < 2 minutes
```

This pattern is the primary deliverable. The website at library.sgraph.ai is the human-facing view of the same content.

---

## Key Constraints (Non-Negotiable)

1. **No server-side rendering** — markdown renders client-side via `<sg-markdown-viewer>` Web Component
2. **No Jekyll/Hugo** — same Web Component + IFD stack as sgraph.ai and tools.sgraph.ai
3. **Aurora design tokens** — dark navy `#1A1A2E` + teal `#4ECDC4`, DM Sans, JetBrains Mono
4. **Raw markdown always accessible** — every `.md` file has a `/raw/` URL alongside its rendered URL
5. **Machine-readable** — `index.json` and `catalogue.csv` at root, auto-generated on push
6. **Cross-project** — the library repo must be usable by SGraph-QA, SGraph-Tools, and future projects with zero modification to the library itself

---

*Phase 1 Design — Context and Current State*
*v0.19.7 — 02 April 2026*
*Sources: v0.13.5 dev-brief (9 Mar), v0.19.7 brief (2 Apr), Librarian inventory audit (v0.13.6)*
