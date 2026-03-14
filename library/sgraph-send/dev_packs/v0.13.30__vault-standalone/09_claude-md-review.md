# CLAUDE.md Review — What to Keep, Adapt, Skip

**Version:** v0.13.30
**Purpose:** Guide for creating CLAUDE.md files in the vault repo, adapted from SG/Send main repo

---

## Main CLAUDE.md (`.claude/CLAUDE.md`)

### KEEP (copy and adapt)

| Section | Why |
|---------|-----|
| MEMORY.md policy | Same rule — no auto-memory, use reality doc instead |
| Reality document mandate | Same rule — if reality doc doesn't list it, it doesn't exist |
| Team structure (Explorer only) | Vault project starts as Explorer team only |
| Key rules — testing | Same "no mocks" principle, in-memory backends |
| Key rules — file naming | Version prefix convention for review docs |
| Key rules — git | dev branch, branch naming, push convention |
| Human folders read-only | Same rule — briefs/ is human-only |

### ADAPT (change for vault context)

| Section | What to Change |
|---------|---------------|
| Project description | "SGraph-AI__Vault — standalone encrypted vault library with Git-like version control" |
| Stack table | Remove Lambda, Mangum, FastAPI. Add `cryptography`, ECDSA, AES-256-GCM. Keep Type_Safe, osbot-utils, osbot-aws, pytest. |
| Architecture | Vault objects (blob, tree, commit, branch), remotes, CLI. Not Lambda functions. |
| Repo structure | Library layout (sgraph_vault/ + tests/) not Lambda layout |
| Current state | Start at v0.1.0 with whatever Session 1 delivers |
| Key documents | Reality doc, dev pack, vault briefs in SG/Send main repo |
| Role system | 7 roles (not 18) |
| Version file | `sgraph_vault/version` |
| Code patterns | Same Type_Safe rules + crypto-specific rules |

### SKIP (not relevant for vault)

| Section | Why |
|---------|-----|
| Two Lambda functions | Vault is a library, not a service |
| Three UIs | No UI in vault library (future phase) |
| 7 deployment targets | Published to PyPI, not deployed to Lambda |
| Lambda URL Functions | No Lambda |
| Memory-FS | Vault has its own storage abstraction |
| Mangum adapter | No Lambda |
| Serverless__Fast_API | No web framework |
| Villager/Town Planner rules | Vault starts as Explorer only |
| Alchemist | No investor materials |
| IFD methodology | Python library, not frontend |
| Smoke tests after deployment | Library, not service |

---

## Explorer CLAUDE.md (`.claude/explorer/CLAUDE.md`)

### KEEP

| Section | Why |
|---------|-----|
| Mission statement | Same — discover, experiment, build first versions |
| What you DO / do NOT do | Same rules (adapted for vault library) |
| Session end protocol | Same — update reality doc |

### ADAPT

| Section | What to Change |
|---------|---------------|
| Team composition | 7 roles: Architect, Dev, AppSec, DevOps, QA, Librarian, Historian |
| Current priorities | Phase 1: core objects + crypto. Phase 2: branches. Phase 3: remotes. Phase 4: CLI. |
| Architecture context | Vault objects, content-addressed, offline-first |
| Key references | Dev pack, vault briefs, vault debrief |
| Reality document path | `team/explorer/librarian/reality/` |

### SKIP

| Section | Why |
|---------|-----|
| Wardley components list | Different project |
| Frontend-specific rules | Python library |
| Lambda deployment | No Lambda |

---

## Team Role Structure

The vault project uses `team/explorer/{role}/`:

```
team/
├── explorer/
│   ├── architect/
│   │   ├── README.md
│   │   ├── ROLE__architect.md
│   │   └── reviews/
│   ├── dev/
│   ├── appsec/
│   ├── devops/
│   ├── qa/
│   ├── librarian/
│   │   ├── README.md
│   │   ├── ROLE__librarian.md
│   │   ├── reviews/
│   │   └── reality/
│   └── historian/
└── humans/dinis_cruz/
    ├── briefs/
    ├── debriefs/
    └── claude-code-web/
```

Each `README.md`: role name, one-line description, link to ROLE file.
Each `ROLE__{name}.md`: full role definition (copy from `03_role-definitions/` in this dev pack).
