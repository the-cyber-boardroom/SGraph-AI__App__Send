# CLAUDE.md Review — What to Keep, Adapt, Skip

**Version:** v0.11.12
**Purpose:** Guide for creating CLAUDE.md files in the tools repo, adapted from SG/Send main repo

---

## Main CLAUDE.md (`.claude/CLAUDE.md`)

### KEEP (copy and adapt)

| Section | Why |
|---------|-----|
| MEMORY.md policy | Same rule — no auto-memory, use BRIEF_PACK.md instead |
| Reality document mandate | Same rule — if reality doc doesn't list it, it doesn't exist |
| Team structure (Explorer only) | Tools project starts as Explorer team only |
| Key rules — testing | Though JS not Python, same "no mocks" principle |
| Key rules — file naming | Version prefix convention for review docs |
| Key rules — git | dev branch, branch naming, push convention |
| Human folders read-only | Same rule — briefs/ is human-only |

### ADAPT (change for tools context)

| Section | What to Change |
|---------|---------------|
| Project description | "sgraph_ai__tools — canonical component library at tools.sgraph.ai" |
| Stack table | Remove Python, Lambda, FastAPI, Memory-FS. Add vanilla JS, ES modules, Web Crypto, FFmpeg WASM |
| Architecture | Three-tier: core/, components/, tools/. CDN-served modules. |
| Repo structure | Three-tier layout (not Lambda layout) |
| Current state | Start at v0.1.0 with whatever Session 1 delivers |
| Key documents | BRIEF_PACK.md, reality doc, source briefs in SG/Send main repo |
| Role system | 6 roles (not 18) |
| Version file | `version` (not `sgraph_ai_app_send/version`) |
| Code patterns | Vanilla JS rules, not Type_Safe rules |

### SKIP (not relevant for tools)

| Section | Why |
|---------|-----|
| Two Lambda functions | Tools has no server-side code |
| Three UIs (user, admin, power) | Tools has tools, not Lambda UIs |
| 7 deployment targets | Tools only deploys to S3 + CloudFront |
| Type_Safe, Pydantic, boto3 rules | Python-specific, tools is JS |
| Memory-FS, Storage_FS | No server-side storage |
| Villager/Town Planner rules | Tools starts as Explorer only |
| Alchemist | No investor materials for tools |
| IFD methodology (full version) | Simplified for JS modules — folder-based versioning covers it |
| Smoke tests after deployment | Different deployment model |

---

## Explorer CLAUDE.md (`.claude/explorer/CLAUDE.md`)

### KEEP

| Section | Why |
|---------|-----|
| Mission statement | Same — discover, experiment, build first versions |
| What you DO / do NOT do | Same rules (adapted for JS) |
| Session end protocol | Same — update BRIEF_PACK.md, reality doc |

### ADAPT

| Section | What to Change |
|---------|---------------|
| Team composition | 6 roles: Architect, Dev, Designer, DevOps, Librarian, Historian |
| Current priorities | Phase 1: repo + crypto. Phase 2: tools. Phase 3: migration. |
| Architecture context | Three-tier, CDN-served, dependency inversion |
| Key references | BRIEF_PACK.md, this dev pack, source briefs |
| Reality document path | `team/explorer/librarian/reality/` |

### SKIP

| Section | Why |
|---------|-----|
| Wardley components list | Different project |
| Python-specific rules | JS project |
| Lambda deployment | No Lambda |

---

## Team Role Structure

The tools project uses `team/explorer/{role}/`:

```
team/
├── explorer/
│   ├── architect/
│   │   ├── README.md
│   │   ├── ROLE__architect.md
│   │   └── reviews/
│   ├── dev/
│   │   ├── README.md
│   │   ├── ROLE__dev.md
│   │   └── reviews/
│   ├── designer/
│   │   ├── README.md
│   │   ├── ROLE__designer.md
│   │   └── reviews/
│   ├── devops/
│   │   ├── README.md
│   │   ├── ROLE__devops.md
│   │   └── reviews/
│   ├── librarian/
│   │   ├── README.md
│   │   ├── ROLE__librarian.md
│   │   ├── reviews/
│   │   └── reality/
│   └── historian/
│       ├── README.md
│       ├── ROLE__historian.md
│       └── reviews/
└── humans/dinis_cruz/
    ├── briefs/
    ├── debriefs/
    └── claude-code-web/
```

Each `README.md`: role name, one-line description, link to ROLE file.
Each `ROLE__{name}.md`: full role definition (copy from `03_role-definitions/` in this dev pack).
