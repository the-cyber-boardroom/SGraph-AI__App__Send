# CLAUDE.md Review — What to Keep, Adapt, Skip

**Version:** v0.11.12
**Purpose:** Guide for creating CLAUDE.md files in the extension repo, adapted from SG/Send main repo

---

## Main CLAUDE.md (`.claude/CLAUDE.md`)

### KEEP (copy and adapt)

| Section | Why |
|---------|-----|
| MEMORY.md policy | Same rule — no auto-memory, use BRIEF_PACK.md |
| Reality document mandate | Same rule — if reality doc doesn't list it, it doesn't exist |
| Team structure (Explorer only) | Extension starts as Explorer only |
| Key rules — testing | Same principle (no mocks, real implementations) |
| Key rules — file naming | Version prefix convention for review docs |
| Key rules — git | dev branch, branch naming, push convention |
| Human folders read-only | Same rule — briefs/ is human-only |

### ADAPT (change for extension context)

| Section | What to Change |
|---------|---------------|
| Project description | "SGraph Key Vault — Chrome extension for encrypted key management" |
| Stack table | Remove Python, Lambda, FastAPI. Add Manifest V3, Web Crypto, Chrome APIs |
| Architecture | Service worker, content script, popup, Chrome Sync |
| Repo structure | extension/ layout (not Lambda layout) |
| Current state | Start at v0.1.0 |
| Key documents | BRIEF_PACK.md, reality doc, source brief in main repo |
| Role system | 7 roles (not 18) — add AppSec given security criticality |
| Version file | `extension/version` |
| Code patterns | Vanilla JS + Chrome APIs, not Type_Safe |
| Security rules | Chrome-specific: key isolation, CSP, origin validation, posture |

### SKIP (not relevant for extension)

| Section | Why |
|---------|-----|
| Two Lambda functions | Extension has no server-side code |
| Three UIs | Extension has popup + management UI (different model) |
| 7 deployment targets | Extension deploys to Chrome Web Store only |
| Type_Safe, Pydantic, boto3 rules | Python-specific |
| Memory-FS, Storage_FS | No server-side storage |
| Villager/Town Planner rules | Extension starts as Explorer only |
| IFD methodology | Different versioning model (Chrome auto-update) |

---

## Explorer CLAUDE.md (`.claude/explorer/CLAUDE.md`)

### KEEP

| Section | Why |
|---------|-----|
| Mission statement | Same — discover, experiment, build first version |
| What you DO / do NOT do | Same rules (adapted for extension) |
| Session end protocol | Same — update BRIEF_PACK.md, reality doc |

### ADAPT

| Section | What to Change |
|---------|---------------|
| Team composition | 7 roles: Architect, Dev, QA, AppSec, DevOps, Librarian, Historian |
| Current priorities | Phase 1: crypto + key bundle. Phase 2: posture. Phase 3: API channel. |
| Architecture context | Service worker, externally_connectable, Chrome Sync |
| Key references | BRIEF_PACK.md, dev pack, source brief |
| Reality document path | `team/explorer/librarian/reality/` |

---

## Team Role Structure

The extension project uses `team/explorer/{role}/`:

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
│   ├── qa/
│   │   ├── README.md
│   │   ├── ROLE__qa.md
│   │   └── reviews/
│   ├── appsec/
│   │   ├── README.md
│   │   ├── ROLE__appsec.md
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
