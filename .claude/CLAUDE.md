# SGraph Send — Agent Guidance

**Read this before starting any task.** This file is the single source of truth for all agents and roles working on SGraph Send.

---

## MEMORY.md Policy

**Do NOT use MEMORY.md** (the auto-memory at `~/.claude/projects/.../memory/MEMORY.md`). All persistent project knowledge is maintained by the Librarian in the repo itself. If you need to record something, add it to the appropriate location in `team/roles/librarian/` or request the Librarian to update the relevant docs.

---

## Project

**SGraph Send** — zero-knowledge encrypted file sharing at [send.sgraph.ai](https://send.sgraph.ai).

Files are encrypted in the browser (AES-256-GCM, Web Crypto API) before upload. The decryption key never leaves the sender's device. The server only stores encrypted ciphertext.

**Version file:** `sgraph_ai_app_send/version`

---

## Stack

| Layer | Technology | Rule |
|-------|-----------|------|
| Runtime | Python 3.12 / arm64 | |
| Web framework | FastAPI via `osbot-fast-api` / `osbot-fast-api-serverless` | Use `Serverless__Fast_API` base class |
| Lambda adapter | Mangum (via osbot-fast-api) | |
| Storage | Memory-FS (`Storage_FS`) | Pluggable backends: memory, disk, S3 |
| AWS operations | `osbot-aws` | **Never use boto3 directly** |
| Type system | `Type_Safe` from `osbot-utils` | **Never use Pydantic** |
| Frontend | Vanilla JS + Web Components (IFD) | Zero framework dependencies |
| Encryption | Web Crypto API (AES-256-GCM) | Client-side only |
| Testing | pytest, in-memory stack | **No mocks, no patches** |
| CI/CD | GitHub Actions | Test → tag → deploy |

---

## Architecture

- **Two Lambda functions** — Public (transfers, health, static UI) and Admin (tokens, stats)
- **Lambda URL Functions** — direct HTTPS endpoints, no API Gateway
- **Memory-FS** — storage abstraction. Application code has no idea which backend is active
- **7 deployment targets** (grouped into 4 patterns): Lambda, Container (Docker/Fargate/GCP), Server (EC2/AMI), CLI
- **Three UIs** — user workflow, power user tools, admin console

---

## Repo Structure

```
sgraph_ai_app_send/              # Application code
  lambda__admin/                 # Admin Lambda (scaffolded, tested)
  lambda__user/                  # User Lambda (in progress)
  utils/                         # Version, shared utilities

sgraph_ai_app_send__ui__admin/   # Admin UI static assets
sgraph_ai_app_send__ui__user/    # User UI static assets

tests/unit/                      # Tests (no mocks, in-memory stack)

.issues/                         # Issues FS (file-based issue tracking)
library/                         # Specs, guides, roadmap, dependencies
  docs/_to_process/              # Original 6 spec documents
  docs/specs/                    # Specs index
  guides/                        # Development guides, IFD, agentic workflow
  roadmap/phases/                # Phase overview

team/                            # Team structure
  roles/                         # Role-based review documents
    architect/                   # API contracts, data models, topology
    appsec/                      # Application security
    cartographer/                # System maps, dependency graphs
    conductor/                   # Product owner role definition
    dev/                         # Implementation plans, code reviews
    devops/                      # Infrastructure, deployment
    historian/                   # Decision tracking
    journalist/                  # Communications, content
    librarian/                   # Knowledge base, Issues FS maintenance
    qa/                          # Test strategy, security testing
  humans/dinis_cruz/briefs/      # Human briefs (input — date-bucketed)
  humans/dinis_cruz/debriefs/    # Team debriefs (output — date-bucketed, with relative links)

.github/workflows/               # CI pipelines
```

---

## Key Rules

### Code Patterns

1. **All schemas** use `Type_Safe` (from `osbot-utils`), never Pydantic
2. **All AWS calls** go through `osbot-aws`, never `boto3` directly
3. **All storage** goes through Memory-FS (`Storage_FS`), never direct filesystem or S3 calls
4. **All FastAPI apps** extend `Serverless__Fast_API` from `osbot-fast-api-serverless`
5. **All tests** use real implementations (in-memory Memory-FS), no mocks or patches
6. **All IDs** are cryptographically random — `Transfer_Id` (12 chars), `Obj_Id` (8 hex chars)
7. **Version prefix** on all review/doc files: `{version}__description.md`
8. **IFD methodology** for all frontend work — Web Components, zero dependencies, surgical versioning

### Security

9. **Server never sees plaintext** — encryption happens in browser, decryption happens in browser
10. **No file names on server** — original file name never sent to server
11. **No decryption keys on server** — key stays with sender, shared out-of-band
12. **IP addresses hashed** — SHA-256 with daily salt, stored as `ip_hash`
13. **All backend data is non-sensitive/non-confidential** — by design

### File Naming

14. **Review files:** `team/roles/{role}/reviews/YY-MM-DD/{version}__{description}.md`
15. **Debrief files:** `team/humans/dinis_cruz/debriefs/MM/DD/{version}__debrief__{description}.md`
16. **Version** comes from `sgraph_ai_app_send/version`
17. **UI assets** use versioned paths: `v0/v0.1/v0.1.0/index.html`

### Testing

17. **No mocks, no patches** — full stack starts in-memory in ~100ms
18. **LocalStack** for S3 integration tests (the only acceptable "fake")
19. **Playwright** for E2E browser tests
20. **Smoke tests** after every deployment (health, auth, CORS, no-plaintext)

### Git

21. **Default branch:** `dev`
22. **Feature branches** branch from `dev`
23. **Branch naming:** `claude/{description}-{session-id}`
24. **Always push with:** `git push -u origin {branch-name}`

---

## Role System

Each agent operates as a specific role. Roles produce review documents in their `team/roles/{role}/reviews/` folder. The Librarian maintains the master index.

**Roles are agentic** — all 10 roles (Conductor, Architect, Dev, QA, DevOps, Librarian, Cartographer, AppSec, Historian, Journalist) are AI agent roles. The Conductor is an orchestration role like any other, responsible for workflow coordination, priority management, and task routing.

**Dinis Cruz** is the human stakeholder, decision-maker, and project owner. He provides briefs in `team/humans/dinis_cruz/briefs/` and sometimes acts directly in any role (e.g., writing code as Dev, configuring CI as DevOps). His briefs drive the team's priorities.

Before starting work, check:
1. Latest human brief in `team/humans/dinis_cruz/briefs/`
2. Latest debrief in `team/humans/dinis_cruz/debriefs/`
3. Latest Librarian master index in `team/roles/librarian/reviews/`
4. Your role's previous reviews in `team/roles/{your-role}/reviews/`

### Debriefs

After completing a batch of work (e.g. all roles responding to a brief), the Librarian creates a **debrief** — a human-facing summary with relative links to every deliverable.

- **Path:** `team/humans/dinis_cruz/debriefs/MM/DD/{version}__debrief__{topic}.md`
- **Purpose:** Single document Dinis can read to see what was delivered, what decisions were made, and what to review
- **Links:** All links to role reviews and other deliverables must be **relative** to the debrief file, so they work both locally and on GitHub
- **When:** Create a debrief whenever a session produces multiple deliverables that need human review
- **Content:** Executive summary, recommended reading order, key decisions needing awareness, what's next

---

## Current Sprint

**Focus:** MVP Release Infrastructure (per Dinis Cruz brief v0.1.4)

**Goal:** Get every deployment target working, every test level running, every storage mode exercised — then never touch infrastructure again.

**"Done" criteria:** Push commit → CI → tests → deploy to dev Lambda automatically. Full transfer cycle works (upload → encrypt → share → download → decrypt → verify). All deployment targets operational. Playwright E2E passing. PyPI install works in clean env.

---

## Key Documents

| Document | Location |
|---|---|
| Project brief | `library/docs/_to_process/01-project-brief.md` |
| Specs index | `library/docs/specs/README.md` |
| Phase roadmap | `library/roadmap/phases/v0.1.1__phase-overview.md` |
| System landscape map | `team/roles/cartographer/v0.1.2/v0.1.2__system-landscape-map-revised.md` |
| Architecture plans | `team/roles/architect/v0.1.1/` |
| Current brief | `team/humans/dinis_cruz/briefs/02/13/v0.2.16__daily-brief__sgraph-send-13-feb-2026.md` |
| Latest debrief | `team/humans/dinis_cruz/debriefs/02/13/v0.2.32__debrief__daily-brief-responses-13-feb.md` |
| Master index (latest) | `team/roles/librarian/reviews/26-02-13/v0.2.24__master-index__daily-brief-responses-13-feb.md` |
| Issues FS | `.issues/` |
