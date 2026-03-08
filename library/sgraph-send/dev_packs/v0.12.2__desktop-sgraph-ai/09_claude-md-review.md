# CLAUDE.md Review — What to Keep, Adapt, Skip

**Version:** v0.12.2
**Purpose:** Guide for creating CLAUDE.md files in the desktop repo, adapted from SG/Send main repo

---

## Main CLAUDE.md (`.claude/CLAUDE.md`)

### KEEP (copy and adapt)

| Section | Why |
|---------|-----|
| MEMORY.md policy | Same rule — no auto-memory, use BRIEF_PACK.md instead |
| Reality document mandate | Same rule — if reality doc doesn't list it, it doesn't exist |
| Team structure (Explorer only) | Desktop project starts as Explorer team only |
| Key rules — file naming | Version prefix convention for review docs |
| Key rules — git | dev branch, branch naming, push convention |
| Human folders read-only | Same rule — briefs/ is human-only |

### ADAPT (change for desktop context)

| Section | What to Change |
|---------|---------------|
| Project description | "SGraph-AI__Desktop — Tauri-based macOS desktop app for the SGraph ecosystem" |
| Stack table | Add Tauri v2, Rust, WebKit webview, vanilla JS, macOS Keychain. Remove Python, Lambda, FastAPI, Memory-FS. |
| Architecture | Tauri app: Rust backend + vanilla JS frontend + remote webviews |
| Repo structure | Tauri layout: src-tauri/ (Rust) + src/ (JS) |
| Current state | Start at v0.1.0 with whatever Session 1 delivers |
| Key documents | BRIEF_PACK.md, reality doc, source briefs in SG/Send main repo |
| Role system | 6 roles (not 18) |
| Version file | `version` (not `sgraph_ai_app_send/version`) |
| Code patterns | Rust patterns for backend, vanilla JS for frontend |
| Testing | Rust tests (#[cfg(test)]), Tauri test utils, no pytest |

### SKIP (not relevant for desktop)

| Section | Why |
|---------|-----|
| Two Lambda functions | Desktop has no server-side deployment |
| Three UIs (user, admin, power) | Desktop has one UI: the app shell |
| 7 deployment targets | Desktop deploys as macOS .app / .dmg |
| Type_Safe, Pydantic, boto3 rules | Python-specific, desktop is Rust + JS |
| Memory-FS, Storage_FS | No in-memory storage abstraction |
| Villager/Town Planner rules | Desktop starts as Explorer only |
| Alchemist | No investor materials for desktop |
| S3/CloudFront deployment | Desktop uses GitHub Releases |
| Smoke tests after deployment | Different deployment model (app binary) |

---

## Explorer CLAUDE.md (`.claude/explorer/CLAUDE.md`)

### KEEP

| Section | Why |
|---------|-----|
| Mission statement | Same — discover, experiment, build first versions |
| What you DO / do NOT do | Same rules (adapted for Rust + JS) |
| Session end protocol | Same — update BRIEF_PACK.md, reality doc |

### ADAPT

| Section | What to Change |
|---------|---------------|
| Team composition | 6 roles: Architect, Dev, Designer, DevOps, Librarian, Historian |
| Current priorities | Phase 1: Tauri project + shell. Phase 2: multi-site + keychain. Phase 3: files + distribution. |
| Architecture context | Tauri v2, Rust backend, vanilla JS frontend, remote webviews |
| Key references | BRIEF_PACK.md, this dev pack, source briefs |
| Reality document path | `team/explorer/librarian/reality/` |

### SKIP

| Section | Why |
|---------|-----|
| Wardley components list | Different project |
| Python-specific rules | Rust + JS project |
| Lambda deployment | No Lambda |
| CDN / S3 deployment | GitHub Releases instead |

---

## Team Role Structure

The desktop project uses `team/explorer/{role}/`:

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
