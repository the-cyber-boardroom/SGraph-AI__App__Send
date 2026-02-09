# SGraph Send — Development Environment, Roles & Multi-Agent Workflow

**Version:** 1.0 DRAFT  
**Date:** February 2026  
**Project:** `SGraph-AI__App__Send` (`send.sgraph.ai`)  
**Context:** Dev environment is being set up. This document captures the team structure, role assignments, workflow model, and initial task allocation across three collaborators.  

---

## 1. Executive Summary

The SGraph Send project is being developed by three collaborators working in a structured multi-agent model:

1. **Human** — Senior Architect, Product Owner, Business Stakeholder, Senior Developer, and Conductor
2. **Claude Code** — Librarian, Architect, and Cartographer
3. **OpenAI Codex** — Developer, Security Reviewer, and QA

This document defines who does what, how they interact, and the initial task allocation for the first development phase.

---

## 2. Team Structure & Role Assignments

### 2.1 Role Definitions (Issues FS Roles)

| Role | Description | Primary Responsibility |
|------|-------------|----------------------|
| **Conductor** | Orchestrates workflow, assigns tasks, resolves conflicts, sign-off | Workflow management |
| **Architect** | System design, API contracts, data models, encryption scheme, technology decisions | Technical direction |
| **Librarian** | Organises documentation, structures roadmap, maintains Issues FS tree, curates knowledge | Information architecture |
| **Cartographer** | Maps the system landscape, dependencies, deployment topology, integration points | System mapping |
| **Developer** | Writes code, implements features, builds UI, writes tests | Code production |
| **QA** | Test plans, E2E tests, security audit, regression testing | Quality assurance |
| **Security Reviewer** | Security assessments, vulnerability analysis, crypto validation, compliance checks | Security |
| **Product Owner** | Defines requirements, prioritises backlog, accepts/rejects deliverables | Product direction |
| **Business Stakeholder** | Commercial strategy, pricing, go-to-market, partnerships | Business direction |

### 2.2 Role Assignments

| Collaborator | Roles | Notes |
|-------------|-------|-------|
| **Human** | Conductor, Senior Architect, Product Owner, Business Stakeholder, Senior Developer | Can be assigned tasks, requirements, and questions. Acts as Conductor initially. Also contributes code directly. |
| **Claude Code** | Librarian, Architect, Cartographer | Focuses on structure, planning, and architectural decisions. Maintains Issues FS. Does NOT primarily write application code — focuses on organising, defining, and mapping. |
| **OpenAI Codex** | Developer, Security Reviewer, QA | Focuses on code implementation, executing defined tasks, security reviews, and testing. Works from briefs and task definitions produced by Human + Claude Code. |

### 2.3 Role Flexibility

These assignments are the **starting configuration**. Roles can swap between collaborators as the project evolves. For example:

- Claude Code could take on Developer tasks for specific areas (Issues FS, config, infrastructure-as-code)
- Codex could take on Architect tasks for specific spikes
- Human may delegate Conductor to Claude Code as Issues FS matures

The key principle: **at any given time, it should be clear who owns each role for each task.**

---

## 3. Collaboration Model

### 3.1 Communication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  HUMAN (Conductor + Product Owner)                          │
│  ═══════════════════════════════════                        │
│  • Defines priorities and requirements                      │
│  • Resolves conflicts between approaches                    │
│  • Signs off on deliverables                                │
│  • Contributes code (FastAPI wiring, CI pipeline)           │
│                                                             │
│         ┌──────────┴──────────┐                             │
│         │                     │                             │
│         ▼                     ▼                             │
│  ┌─────────────┐     ┌──────────────┐                      │
│  │ CLAUDE CODE  │     │ OPENAI CODEX │                      │
│  │ (Librarian,  │     │ (Developer,  │                      │
│  │  Architect,  │     │  Security,   │                      │
│  │  Cartographer│     │  QA)         │                      │
│  └─────────────┘     └──────────────┘                      │
│         │                     │                             │
│         │  Issues FS tasks    │                             │
│         │  Architecture docs  │                             │
│         │  API contracts      │                             │
│         └────────────────────►│                             │
│                               │                             │
│         Claude Code defines   │  Codex implements           │
│         WHAT to build         │  HOW to build it            │
│                               │                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Plan Mode — Parallel Planning Loop

A key workflow for critical design decisions (like the FastAPI service and UI architecture):

```
Step 1: Human defines the requirement
         "Build the FastAPI service that powers the API and the frontend UI"

Step 2: PARALLEL PLANNING
         ┌─────────────────────────────────────────┐
         │                                         │
         │  Claude Code (Architect):               │
         │  "This is what I think should be        │
         │   implemented and how I'd structure it" │
         │                                         │
         │  Codex (Developer):                     │
         │  "This is how I interpret the brief     │
         │   and this is how I would build it"     │
         │                                         │
         └─────────────────────────────────────────┘

Step 3: Human (Conductor) compares both plans
         - Identifies areas of agreement (proceed)
         - Identifies conflicts (resolve)
         - Merges into final brief

Step 4: Final brief is created
         - Agreed architecture
         - Agreed API contracts
         - Agreed UI structure
         - Task breakdown ready for implementation

Step 5: Codex implements from the final brief
         Claude Code updates Issues FS to track progress
```

This parallel planning approach ensures:
- Two independent perspectives on every critical design decision
- Conflicts are surfaced early, before code is written
- The final brief is stronger than either individual plan
- Both collaborators understand and buy into the design

### 3.3 When to Use Plan Mode

Plan Mode should be used for:
- FastAPI service design (first use case)
- UI/frontend architecture
- Encryption implementation decisions
- Pre-signed URL flow design
- Plugin architecture design
- Any decision that's hard to reverse once code is written

Plan Mode is NOT needed for:
- Straightforward task implementation (just assign and execute)
- Bug fixes
- Documentation updates
- Issues FS structure changes (Claude Code's domain)

---

## 4. Issues FS as Project Management

### 4.1 Dual Purpose

Issues FS serves two purposes in this project:

1. **Project management for SGraph Send** — tracking all tasks, stories, epics, assignments, and progress
2. **Active development of Issues FS itself** — this project is a proving ground for Issues FS, pushing it to its limits and driving improvements

This means Claude Code (as Librarian) has permission to propose and make changes to the Issues FS system itself when the project's needs exceed its current capabilities. The SGraph Send project is both a consumer and a driver of Issues FS development.

### 4.2 Librarian's First Task — Organise the Knowledge Base

There is currently a large pile of ideas across six specification documents:

1. `secure-send-brief.md` — MVP specification
2. `secure-send-roadmap.md` — Deploy-everywhere, cost tracking, billing, fingerprinting, IDS, bot detection
3. `secure-send-plugins-i18n-commercial.md` — Plugins, i18n, accessibility, commercialisation
4. `secure-send-llm-retention-compliance-gtm.md` — LLM integration, retention, compliance, go-to-market
5. `secure-send-strategic-opportunities.md` — CLI/SDK, MCP, one-time secrets, browser extension, data rooms, P2P, etc.
6. `sgraph-ai-naming-branding-strategy.md` — Naming, branding, portfolio strategy

The Librarian should:
- Structure these into a folder/graph hierarchy
- Separate Phase 1 (immediate) from later phases
- Create the Issues FS epic/story/task tree for Phase 1
- Make it clear what's in scope NOW vs what's deferred

### 4.3 Issues FS Tree Structure

```
SGraph-AI__App__Send/
├── .issues-fs/
│   ├── roadmap/
│   │   ├── phase-0-mvp/           ← CURRENT FOCUS
│   │   │   ├── epic-core-transfer/
│   │   │   ├── epic-api-service/
│   │   │   ├── epic-frontend-ui/
│   │   │   ├── epic-deployment/
│   │   │   └── epic-ci-pipeline/
│   │   ├── phase-1-deploy-everywhere/
│   │   ├── phase-2-billing/
│   │   └── .../
│   ├── specs/                     ← Reference documents
│   │   ├── brief.md
│   │   ├── roadmap.md
│   │   ├── plugins-i18n-commercial.md
│   │   ├── llm-retention-compliance-gtm.md
│   │   ├── strategic-opportunities.md
│   │   └── naming-branding.md
│   └── decisions/                 ← Architecture Decision Records
│       ├── 001-encryption-model.md
│       ├── 002-pre-signed-urls.md
│       └── ...
```

---

## 5. Phase 1 — Initial Task Allocation

### 5.1 Human Tasks

| Task | Role | Priority | Description |
|------|------|----------|-------------|
| **Wire up FastAPI + serverless** | Developer | P0 | Add OSS FastAPI serverless capabilities to the project. This is the foundation that enables shipping to prod. |
| **CI pipeline** | Developer | P0 | Set up CI pipeline: build → test → deploy to dev → QA → prod |
| **Dev/QA/Prod environments** | Developer | P0 | Configure three environments with the subdomain pattern (dev-send, qa-send, send.sgraph.ai) |
| **Resolve plan conflicts** | Conductor | P0 | Compare Claude Code and Codex plans for FastAPI + UI, merge into final brief |
| **Product priorities** | Product Owner | Ongoing | Define what's in/out of Phase 1 scope |

### 5.2 Claude Code Tasks (Librarian + Architect + Cartographer)

| Task | Role | Priority | Description |
|------|------|----------|-------------|
| **Organise knowledge base** | Librarian | P0 | Structure the six spec documents into Issues FS hierarchy. Separate Phase 1 from later phases. |
| **Create Phase 1 Issues FS tree** | Librarian | P0 | Instantiate epics, stories, and tasks for MVP. Assign roles. |
| **FastAPI service plan** | Architect | P0 | Plan Mode: produce architectural plan for the FastAPI service (endpoints, data model, pre-signed URL flow, Lambda handler) |
| **UI plan** | Architect | P0 | Plan Mode: produce architectural plan for the frontend UI (upload page, download page, status page, transparency panel) |
| **System landscape map** | Cartographer | P1 | Map the deployment topology, service dependencies, data flows |
| **Issues FS improvements** | Librarian | Ongoing | Identify and implement Issues FS improvements driven by this project's needs |

### 5.3 OpenAI Codex Tasks (Developer + Security + QA)

| Task | Role | Priority | Description |
|------|------|----------|-------------|
| **FastAPI service plan** | Developer | P0 | Plan Mode: independently produce implementation plan for the FastAPI service. How would you build this? |
| **UI plan** | Developer | P0 | Plan Mode: independently produce implementation plan for the frontend UI. How would you build this? |
| **Implement FastAPI service** | Developer | P0 | After plan merge: build the FastAPI service from the final brief |
| **Implement frontend UI** | Developer | P0 | After plan merge: build the static frontend (HTML/JS/CSS, Web Crypto API) |
| **Security review** | Security Reviewer | P1 | Review encryption implementation, pre-signed URL security, input validation |
| **Test plans** | QA | P1 | Write test plans for core transfer flow, define E2E test suite |

### 5.4 Task Sequencing

```
WEEK 1:
  Human:       Wire up FastAPI + serverless foundation
  Claude Code: Organise knowledge base → Create Phase 1 Issues FS tree
  Codex:       (waiting for plan merge — can start on project scaffolding)

WEEK 1-2 (PLAN MODE):
  Claude Code: Produce FastAPI + UI architectural plan
  Codex:       Produce FastAPI + UI implementation plan
  Human:       Compare, resolve conflicts, merge into final brief

WEEK 2-3:
  Human:       CI pipeline + environments
  Codex:       Implement FastAPI service from final brief
  Claude Code: Track progress in Issues FS, refine architecture as needed

WEEK 3-4:
  Codex:       Implement frontend UI from final brief
  Codex:       Security review of encryption implementation
  Claude Code: System landscape map, documentation
  Human:       Integration testing, deploy to dev

WEEK 4+:
  All:         MVP integration, QA, deploy to prod
```

---

## 6. First Plan Mode Exercise — FastAPI Service + UI

### 6.1 The Requirement

Build the FastAPI service that powers the SGraph Send API and the frontend UI for the MVP.

**What exists (from the spec documents):**

API Endpoints:
- `POST /transfers` (token auth) → pre-signed upload URL
- `POST /transfers/{id}/complete` (token auth) → download link + transparency data
- `GET /transfers/{id}` (public) → metadata + download count
- `GET /transfers/{id}/download` (public) → pre-signed download URL + log event
- `POST /tokens` (admin) → create token
- `GET /tokens` (admin) → list tokens with usage
- `DELETE /tokens/{id}` (admin) → revoke token

Frontend Pages:
- Upload page (drag-and-drop, encrypt in browser, upload via pre-signed URL)
- Result page (download link + decryption key, transparency panel)
- Download page (enter key, download via pre-signed URL, decrypt in browser)
- Status page (download count, events, expiry)

Encryption:
- AES-256-GCM, client-side, Web Crypto API
- Key generated in browser, never sent to server
- Pre-signed S3 URLs for upload/download (Lambda never touches file bytes)

### 6.2 What Each Collaborator Should Produce

**Claude Code (Architect) should produce:**
- System architecture diagram
- API contract (request/response schemas, status codes, error format)
- Data model (S3 object structure, meta.json, events.json)
- Pre-signed URL flow (sequence diagram)
- Lambda/serverless handler design
- Frontend component breakdown
- Technology choices and rationale

**Codex (Developer) should produce:**
- Implementation plan (what to build first, dependencies)
- Proposed file/folder structure
- Key code patterns (how encryption is handled, how pre-signed URLs are generated)
- Testing strategy
- Any concerns or questions about the brief
- Estimated effort per component

**Human (Conductor) will then:**
- Compare both plans
- Identify agreements and conflicts
- Resolve conflicts
- Merge into a single final brief
- Assign implementation tasks

---

## 7. Technical Environment

### 7.1 What's Being Set Up

| Component | Technology | Status |
|-----------|-----------|--------|
| **Backend** | Python 3.12, FastAPI | Being wired up |
| **Serverless** | OSS FastAPI serverless (Mangum or equivalent) | Human wiring up |
| **Frontend** | Static HTML/JS/CSS (no framework for MVP) | To be built |
| **Encryption** | Web Crypto API (browser-side AES-256-GCM) | To be built |
| **Storage** | S3 (encrypted blobs + metadata JSON) | To be configured |
| **CI/CD** | GitHub Actions | To be set up |
| **Environments** | dev → QA → prod (subdomain pattern) | To be configured |
| **Deployment** | Lambda (via Mangum) + S3 static hosting + CloudFront | To be configured |

### 7.2 Environment URLs

| Environment | API URL | Frontend URL |
|-------------|---------|-------------|
| **Dev** | `dev-send.sgraph.ai/api/` | `dev-send.sgraph.ai` |
| **QA** | `qa-send.sgraph.ai/api/` | `qa-send.sgraph.ai` |
| **Prod** | `send.sgraph.ai/api/` | `send.sgraph.ai` |

---

## 8. Key Principles

1. **Issues FS is the source of truth** — all tasks, decisions, and progress are tracked in Issues FS
2. **Plan Mode for critical decisions** — both Claude Code and Codex independently plan, then merge
3. **Codex implements, Claude Code structures** — clear separation of code production vs knowledge management
4. **Human is the tie-breaker** — when plans conflict, the Conductor decides
5. **Ship early** — the FastAPI + serverless wiring should enable deployment to dev from day one
6. **This project improves Issues FS** — any friction in the workflow is an opportunity to improve Issues FS itself
7. **Roles are assigned, not fixed** — they can shift as the project evolves, but at any moment it's clear who owns what

---

*This document captures the development environment setup, team structure, and multi-agent workflow for SGraph Send. It should be used as the reference for how the three collaborators work together. The six specification documents (brief, roadmap, plugins, LLM/compliance, strategic opportunities, naming) contain the WHAT. This document defines the WHO and HOW.*
