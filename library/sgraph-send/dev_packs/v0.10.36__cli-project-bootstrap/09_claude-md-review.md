# CLAUDE.md Review — What to Keep, Adapt, Skip

**Version:** v0.10.36
**Purpose:** Guide for creating CLAUDE.md files in the CLI repo, adapted from SG/Send main repo

---

## Main CLAUDE.md (`.claude/CLAUDE.md`)

### KEEP (copy and adapt)

| Section | Why |
|---|---|
| MEMORY.md policy | Same rule — no auto-memory, use librarian |
| Reality document mandate | Same rule — if reality doc doesn't list it, it doesn't exist |
| Team structure (Explorer only) | CLI project starts as Explorer team only |
| Key rules — code patterns | Type_Safe, no Pydantic, no boto3 |
| Key rules — testing | No mocks, no patches |
| Key rules — file naming | Version prefix convention |
| Key rules — git | dev branch, branch naming, push convention |
| Human folders read-only | Same rule — briefs/ is human-only |
| Debrief format | Same relative link rules |

### ADAPT (change for CLI context)

| Section | What to Change |
|---|---|
| Project description | "SG_Send__CLI — encrypted vault sync CLI (git-inspired)" |
| Stack table | Remove Lambda, FastAPI, Memory-FS. Add Typer, httpx, cryptography |
| Architecture | Remove Lambda functions. Add CLI layers: Typer__Routes → commands → core |
| Repo structure | `sg_send_cli/` layout (types, schemas, core, commands, cli) |
| Current state | Start at v0.1.0 with whatever Session 1 delivers |
| Key documents | Point to CLI-specific reality doc, assessment v2 in main repo |
| Role system | 6 roles (not 18) |
| Version file | `sg_send_cli/version` |
| Deployment targets | PyPI only (no Lambda, no Docker) |

### SKIP (not relevant for CLI)

| Section | Why |
|---|---|
| Two Lambda functions | CLI has no server-side code |
| Three UIs | CLI has no browser UI |
| 7 deployment targets | CLI only deploys to PyPI |
| IFD methodology | Not building a UI |
| Villager/Town Planner rules | CLI starts as Explorer only |
| Alchemist | No investor materials for CLI |

---

## Explorer CLAUDE.md (`.claude/explorer/CLAUDE.md`)

### KEEP

| Section | Why |
|---|---|
| Mission statement | Same — discover, experiment, build first versions |
| What you DO / do NOT do | Same rules |
| Explorer questions | Same learning mindset |
| Handover protocol | Same — when ready, brief the Villager |

### ADAPT

| Section | What to Change |
|---|---|
| Team composition | 6 roles: Architect, Dev, QA, DevOps, Librarian, Historian |
| Current priorities | Phase 1: pipeline + crypto. Phase 2: core services. Phase 3: CLI commands. |
| Architecture context | CLI architecture (not Lambda architecture) |
| Key references | Point to CLI reality doc, this dev pack |
| Reality document path | `team/explorer/librarian/reality/` |

### SKIP

| Section | Why |
|---|---|
| Wardley components list | Different project, different components |
| Design agency brief | Not relevant |
| Issues FS adoption | May add later |

---

## Team Role Structure

The CLI project uses `team/explorer/{role}/` instead of `team/roles/{role}/`:

```
team/
├── explorer/
│   ├── architect/
│   │   ├── README.md            # Role overview, links
│   │   ├── ROLE__architect.md   # Full role definition
│   │   └── reviews/             # Session outputs
│   ├── dev/
│   │   ├── README.md
│   │   ├── ROLE__dev.md
│   │   └── reviews/
│   ├── qa/
│   │   ├── README.md
│   │   ├── ROLE__qa.md
│   │   └── reviews/
│   ├── devops/
│   │   ├── README.md
│   │   ├── ROLE__devops.md
│   │   └── reviews/
│   ├── librarian/
│   │   ├── README.md
│   │   ├── ROLE__librarian.md
│   │   ├── reviews/
│   │   └── reality/             # Reality document lives here
│   └── historian/
│       ├── README.md
│       ├── ROLE__historian.md
│       └── reviews/
└── humans/dinis_cruz/
    ├── briefs/                  # READ-ONLY for agents
    ├── debriefs/
    └── claude-code-web/
```

Each `README.md` should be short — role name, one-line description, link to ROLE file.

Each `ROLE__{name}.md` should contain the full role definition from the dev pack (copy from `03_role-definitions/ROLE__{name}.md`).

**Why ROLE__{name}.md naming?** So that when sharing multiple role files in a Claude session (which doesn't like duplicate filenames), each file has a unique name.
