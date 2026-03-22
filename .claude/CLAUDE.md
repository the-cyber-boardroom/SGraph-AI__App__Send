# SGraph Send — Agent Guidance

**Read this before starting any task.** This file is the single source of truth for all agents and roles working on SGraph Send.

---

## MEMORY.md Policy

**Do NOT use MEMORY.md** (the auto-memory at `~/.claude/projects/.../memory/MEMORY.md`). All persistent project knowledge is maintained by the Librarian in the repo itself. If you need to record something, add it to the appropriate location in `team/roles/librarian/` or request the Librarian to update the relevant docs.

---

## Reality Document — MANDATORY CHECK

**Before describing, assessing, or assuming what SGraph Send can do, READ:**

`team/roles/librarian/reality/v0.16.26__what-exists-today.md`

This is the **code-verified** record of every endpoint, UI page, test, and feature that actually exists. It was built by auditing source code, not briefs or reviews.

### Rules (Non-Negotiable)

1. **If the reality document doesn't list it, it does not exist.** Do not describe proposed features as if they are shipped.
2. **Proposed features must be labelled.** If you describe something not in the reality document, you MUST write: "PROPOSED — does not exist yet."
3. **Briefs are aspirations, not facts.** A brief describing user trails, tools, or features does NOT mean those features exist. Always cross-check against the reality document.
4. **Update the reality document when you change code.** If you add, remove, or change an endpoint, UI page, or test, update the reality document in the same commit.
5. **Update the reality document when processing briefs.** If a brief mentions new features or goals, check whether they exist and add any missing items to the "DOES NOT EXIST" section.
6. **Update the reality document when creating debriefs.** Every debrief should reference the reality document and confirm which deliverables are code-verified vs. proposed.

### When to Read It

- **Starting a session** — read it alongside briefs and debriefs
- **Processing a human brief** — cross-check brief claims against reality
- **Creating a debrief** — confirm what's real vs. proposed
- **Writing any review or assessment** — ground your analysis in what exists
- **Describing features to investors or external audiences** — only claim what's verified

---

## Team Structure: Explorer and Villager

As of v0.5.8, the project operates with **three teams** based on Wardley Maps methodology:

| Team | Focus | Wardley Stage | Output |
|------|-------|---------------|--------|
| **Explorer** | Discover, experiment, build first versions | Genesis → Custom-Built | Minor versions (IFD) |
| **Villager** | Stabilise, harden, deploy to production | Custom-Built → Product | Major versions (IFD releases) |
| **Town Planner** | Transmute technical output into investment and business value | Product → Commodity | Investor materials, business strategy |

**Session-specific instructions** live in `.claude/explorer/CLAUDE.md`, `.claude/villager/CLAUDE.md`, and `.claude/town-planner/CLAUDE.md`. When starting a new Claude Code session, the human will indicate which team context applies. Read the team-specific CLAUDE.md for your session's rules.

### Key Separation Rules

1. **Villagers do NOT add features.** Functionality is frozen at the Explorer's final version.
2. **Villagers do NOT fix bugs that change behaviour.** Bugs go back to Explorer.
3. **Explorers do NOT deploy to production.** Production is Villager territory.
4. **Explorers do NOT optimise for performance.** That's the Villager's job.
5. **Town Planners do NOT make technical decisions.** They translate technical output into business value.
6. **Town Planners do NOT create user-facing marketing.** That's the Ambassador/Journalist. Town Planners speak to investors.
7. **Distinct environments.** Explorer, Villager, and Town Planner operate in separate infrastructure.

### Role Definitions

- **Explorer role definition:** `team/humans/dinis_cruz/briefs/02/14/v0.3.2__role-definition__explorer.md`
- **Villager role definition:** `team/humans/dinis_cruz/briefs/02/14/v0.3.2__role-definition__villager.md`
- **Alchemist role definition:** `team/humans/dinis_cruz/briefs/02/21/v0.5.8__role-definition__alchemist.md`
- **Wardley Maps context:** `team/humans/dinis_cruz/briefs/02/14/v0.3.2__briefs__wardley-maps-in-sgraph-project.md`

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
  sgraph-send/dev_packs/         # Briefing packs for agent sessions (D065)
  alchemist/                     # Alchemist materials library (narratives, materials, investors, due diligence)

team/                            # Team structure
  roles/                         # Explorer team role-based review documents
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
  villager/roles/                # Villager team roles (mirrored structure)
  town-planner/roles/            # Town Planner team roles
    alchemist/                   # Investment, business strategy, investor relations
  humans/dinis_cruz/briefs/      # Human briefs (input — date-bucketed)
  humans/dinis_cruz/debriefs/    # Team debriefs (output — date-bucketed, with relative links)

.claude/                         # Claude Code session configuration
  CLAUDE.md                      # This file — shared guidance for all sessions
  explorer/CLAUDE.md             # Explorer team session instructions
  villager/CLAUDE.md             # Villager team session instructions
  town-planner/CLAUDE.md         # Town Planner team session instructions

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

14. **Review files:** `team/roles/{role}/reviews/MM/DD/{version}__{description}.md`
15. **Debrief files:** `team/humans/dinis_cruz/debriefs/MM/DD/{version}__debrief__{description}.md`
16. **Version** comes from `sgraph_ai_app_send/version`
17. **UI assets** use versioned paths: `v0/v0.1/v0.1.0/index.html`

### Human Folders — Read-Only for Agents

18. **`team/humans/dinis_cruz/briefs/` is HUMAN-ONLY.** Agents must NEVER create, modify, or move files into this folder. It is reserved exclusively for files that the human creates and uploads. This rule has no exceptions.
19. **Agent session outputs** go to `team/humans/dinis_cruz/claude-code-web/MM/DD/` — this is the folder for decisions, observations, and documents produced during Claude Code sessions.
20. **Debriefs** go to `team/humans/dinis_cruz/debriefs/MM/DD/` — summaries of session deliverables for human review.
21. **Role reviews** go to `team/roles/{role}/reviews/MM/DD/` — the standard output location for all role work.

### Testing

18. **No mocks, no patches** — full stack starts in-memory in ~100ms
19. **LocalStack** for S3 integration tests (the only acceptable "fake")
20. **Playwright** for E2E browser tests
21. **Smoke tests** after every deployment (health, auth, CORS, no-plaintext)

### Git

22. **Default branch:** `dev`
23. **Feature branches** branch from `dev`
24. **Branch naming:** `claude/{description}-{session-id}`
25. **Always push with:** `git push -u origin {branch-name}`
26. **Pull from dev before starting work** — always run `git fetch origin dev && git merge origin/dev` at the start of every session before making any changes

---

## Role System

Each agent operates as a specific role. Roles produce review documents in their `team/roles/{role}/reviews/` folder. The Librarian maintains the master index.

**18 roles across three teams** — Conductor, Architect, Dev, QA, DevOps, Librarian, Cartographer, AppSec, Historian, Journalist, Designer, Advocate, Sherpa, Ambassador, CISO, DPO, GRC, Alchemist. Plus three meta-roles: Explorer (leads Explorer team), Villager (leads Villager team), and Town Planner (leads Town Planner team).

**Dinis Cruz** is the human stakeholder, decision-maker, and project owner. He provides briefs in `team/humans/dinis_cruz/briefs/` and sometimes acts directly in any role. His briefs drive the team's priorities. **Daily briefs will be team-specific** — Explorer briefs, Villager briefs, and Town Planner briefs. **IMPORTANT: The `briefs/` folder is read-only for agents.** Only the human creates files there. Agent outputs go to `team/humans/dinis_cruz/claude-code-web/` or `team/roles/{role}/reviews/`.

Before starting work, check:
1. **Reality document** at `team/roles/librarian/reality/v0.16.26__what-exists-today.md` — what actually exists in code
2. Latest human brief in `team/humans/dinis_cruz/briefs/`
3. Latest debrief in `team/humans/dinis_cruz/debriefs/`
4. Latest Librarian master index in `team/roles/librarian/reviews/`
5. Your role's previous reviews in `team/roles/{your-role}/reviews/`

### Debriefs

After completing a batch of work, the Librarian creates a **debrief** — a human-facing summary with relative links to every deliverable.

- **Path:** `team/humans/dinis_cruz/debriefs/MM/DD/{version}__debrief__{topic}.md`
- **Purpose:** Single document Dinis can read to see what was delivered, what decisions were made, and what to review
- **Links:** All links must be **relative** to the debrief file and **must work in GitHub's web UI**. **COUNT THE DIRECTORY DEPTH CAREFULLY.** Debriefs live at `team/humans/dinis_cruz/debriefs/MM/DD/file.md` — that's **5 directories deep** from the repo root. Use this reference table:

  | Link target | Levels up | Prefix | Example |
  |---|---|---|---|
  | Another debrief (`debriefs/MM/DD/`) | 2 | `../../` | `../../02/14/v0.3.0__debrief__topic.md` |
  | Briefs (`briefs/MM/DD/`) | 3 + down | `../../../briefs/` | `../../../briefs/02/14/v0.3.2__brief.md` |
  | Claude-code-web (`claude-code-web/MM/DD/`) | 3 + down | `../../../claude-code-web/` | `../../../claude-code-web/02/14/file.md` |
  | Role reviews (`team/roles/{role}/reviews/`) | **5** + down | `../../../../../roles/` | `../../../../../roles/architect/reviews/03/01/file.md` |
  | Library (`library/`) | **6** + down | `../../../../../../library/` | `../../../../../../library/docs/specs/README.md` |

  **The most common mistake** is linking to `team/roles/` with only 3 levels (`../../../roles/...`). This resolves to `team/humans/dinis_cruz/roles/...` which does not exist. You need **5 levels** (`../../../../../roles/...`) to reach `team/` and then down into `roles/`.

  **Always verify** relative links resolve correctly before committing — run: `cd team/humans/dinis_cruz/debriefs/MM/DD && ls -la ../../../../../roles/{role}/reviews/MM/DD/filename.md`
- **When:** Create a debrief whenever a session produces multiple deliverables
- **Content:** Executive summary, recommended reading order, key decisions, what's next

---

## Current State (v0.16.26)

**See `team/roles/librarian/reality/v0.16.26__what-exists-today.md` for the full code-verified picture.**

**Summary:** 73+ HTTP endpoints (18 User + 55 Admin), 6 User UI pages, 17 Admin components, 393+ passing tests, MCP on both Lambdas, full encryption pipeline, data rooms, personal vaults, PKI, audit trails, token management, analytics. Reality document last code-audited at v0.13.34; PROPOSED items tracked through v0.16.26.

**Three parallel tracks:**
1. **Explorer track:** New features (rooms, vaults, PKI, MCP, vault redesign, upload UX), experiments, first versions
2. **Villager track:** IFD production release, deployment hardening, performance, monitoring, stability
3. **Town Planner track:** Investor materials, business strategy, Alchemist narratives

---

## Key Documents

| Document | Location |
|---|---|
| **Reality document** | `team/roles/librarian/reality/v0.16.26__what-exists-today.md` |
| Project brief | `library/docs/_to_process/01-project-brief.md` |
| Specs index | `library/docs/specs/README.md` |
| Phase roadmap | `library/roadmap/phases/v0.1.1__phase-overview.md` |
| System landscape map | `team/roles/cartographer/v0.1.2/v0.1.2__system-landscape-map-revised.md` |
| Architecture plans | `team/roles/architect/v0.1.1/` |
| Wardley Maps brief | `team/humans/dinis_cruz/briefs/02/14/v0.3.2__briefs__wardley-maps-in-sgraph-project.md` |
| Explorer role definition | `team/humans/dinis_cruz/briefs/02/14/v0.3.2__role-definition__explorer.md` |
| Villager role definition | `team/humans/dinis_cruz/briefs/02/14/v0.3.2__role-definition__villager.md` |
| Latest debrief | `team/humans/dinis_cruz/debriefs/03/18/v0.16.26__debrief__briefs-processing-13-to-18-march.md` |
| Session handoff | `team/humans/dinis_cruz/debriefs/03/18/v0.16.26__session-handoff__explorer-librarian-brief-processing.md` |
| Master index (latest) | `team/roles/librarian/reviews/03/18/v0.16.26__master-index__briefs-13-to-18-march.md` |
| Master index (addendum) | `team/roles/librarian/reviews/03/19/v0.16.21__master-index__briefs-18-march-addendum.md` |
| Issues FS | `.issues/` |
| IFD guide | `library/guides/development/ifd/v1.2.1__ifd__intro-and-how-to-use.md` |
