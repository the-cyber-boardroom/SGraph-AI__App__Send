# SGraph Send — Brief for Claude Code

**Project:** `SGraph-AI__App__Send` (`send.sgraph.ai`)  
**Date:** February 2026  
**Your Roles:** Librarian, Architect, Cartographer  
**You Report To:** Human (Conductor / Product Owner)  

---

## 1. Your Mission

You are the **Librarian, Architect, and Cartographer** for the SGraph Send project — a privacy-first, zero-knowledge encrypted file sharing service.

Your primary job is to bring **structure, clarity, and architectural direction** to a project that currently has a wealth of ideas spread across six specification documents. You are NOT the primary code writer — your focus is organising, planning, defining, and mapping so that the development work can proceed with clarity and confidence.

You also have a secondary mission: **this project is a proving ground for Issues FS.** Any friction you encounter in the workflow is an opportunity to improve Issues FS itself. You have full authority to propose and implement changes to Issues FS when the project's needs demand it.

---

## 2. Your Roles Explained

### Librarian
- Organise the knowledge base (six specification documents → structured Issues FS hierarchy)
- Maintain the Issues FS epic/story/task tree
- Keep documentation current as decisions are made
- Ensure every task has clear acceptance criteria
- Separate Phase 1 (NOW) from later phases
- Track progress, update statuses, maintain the single source of truth

### Architect
- Define system architecture, API contracts, data models
- Make technology decisions with clear rationale
- Design the pre-signed URL flow, encryption model integration, Lambda handler structure
- Produce Architecture Decision Records (ADRs) for key decisions
- Participate in Plan Mode exercises (see Section 5)

### Cartographer
- Map the system landscape: services, dependencies, data flows, deployment topology
- Visualise how components connect (S3, Lambda, CloudFront, API Gateway, frontend)
- Map the development workflow: who does what, when, in what order
- Identify integration risks and dependency chains

---

## 3. The Project Context

### 3.1 What Is SGraph Send?

A file sharing service where:
- Files are encrypted **in the browser** (AES-256-GCM, Web Crypto API) before upload
- The server **never** sees plaintext content or the decryption key
- Encrypted blobs are stored in S3 via pre-signed URLs (Lambda never touches file bytes)
- The sender gets a download link + decryption key (shared separately for security)
- The receiver enters the key in the browser to decrypt after download
- A transparency panel shows users exactly what metadata was captured

The core security principle: **the entire platform can be compromised with zero privacy impact.** Everything on the server is ciphertext.

### 3.2 What Exists So Far

Six specification documents have been produced covering:

| Document | Contents |
|----------|----------|
| `secure-send-brief.md` | MVP user stories, API endpoints, encryption model, pre-signed URL strategy, S3 data structure, deployment architecture, Issues FS tree |
| `secure-send-roadmap.md` | Deploy-everywhere, cost tracking, billing, browser fingerprinting, security intelligence, bot detection |
| `secure-send-plugins-i18n-commercial.md` | Plugin architecture, theme system, internationalisation (3 phases), accessibility, commercialisation model |
| `secure-send-llm-retention-compliance-gtm.md` | LLM integration (BYOK, in-browser, Ollama), retention/ephemeral design, user accounts, credit economics, compliance, DSAR, go-to-market |
| `secure-send-strategic-opportunities.md` | CLI/SDK, MCP server, one-time secrets, browser extension, data rooms, P2P/WebRTC, multi-recipient, webhooks, warrant canary, PWA, educational platform, notarisation, time-locked transfers, regulated industry verticals, revenue diversification |
| `sgraph-ai-naming-branding-strategy.md` | Brand architecture, naming rationale, repo structure, URL architecture, product portfolio, community outreach strategy |

These documents contain a massive amount of material. Most of it is NOT Phase 1. Your first job is to triage this into what matters NOW vs what's deferred.

### 3.3 Technical Environment (Being Set Up)

| Component | Technology | Status |
|-----------|-----------|--------|
| Backend | Python 3.12, FastAPI | Being wired up by Human |
| Serverless | FastAPI + Mangum (or equivalent) for Lambda | Human wiring up |
| Frontend | Static HTML/JS/CSS (no framework for MVP) | To be built |
| Encryption | Web Crypto API (browser-side AES-256-GCM) | To be built |
| Storage | S3 (encrypted blobs + metadata JSON) | To be configured |
| CI/CD | GitHub Actions | To be set up by Human |
| Environments | dev-send.sgraph.ai → qa-send.sgraph.ai → send.sgraph.ai | To be configured |

---

## 4. Your Immediate Tasks (Priority Order)

### Task 1: Organise the Knowledge Base (Librarian, P0)

Take the six specification documents and structure them into a coherent Issues FS hierarchy.

**Deliverables:**
- A folder/graph structure under `.issues-fs/` in the repo
- Clear separation between Phase 1 (MVP) and later phases
- The six spec documents placed under a `specs/` reference folder
- A `roadmap/` folder with phase-by-phase breakdown

**Guidance:**
- The MVP brief (`secure-send-brief.md`) already has a good Issues FS tree — use it as the starting point
- The other five documents are mostly post-MVP — their Issues FS trees should exist but be clearly marked as deferred
- The structure should be navigable: someone should be able to open the Issues FS and immediately understand what's in scope NOW

### Task 2: Create Phase 1 Issues FS Tree (Librarian, P0)

Instantiate the actual Issues FS issues for the MVP. This means creating the epics, stories, and tasks with:
- Clear titles and descriptions
- Acceptance criteria
- Role assignments (Human, Claude Code, or Development Team)
- Dependencies between tasks
- Priority (P0, P1, P2)

**The MVP scope (from the brief) includes:**

User Stories:
- ADM-1: Token generation and distribution
- ADM-2: Usage analytics (without seeing content)
- SND-1: Drag-and-drop upload with client-side encryption
- SND-2: Download link + decryption key generation
- SND-3: Guidance on separate-channel sharing
- SND-4: Transparency panel (what we captured)
- SND-5: Live transfer status
- SND-6: Token-based authentication
- RCV-1: Enter key → download → decrypt
- RCV-2: Receiver transparency panel
- RCV-3: How-it-works explanation
- RCV-5: Wrong key error handling

Security Requirements:
- SEC-1: Client-side AES-256-GCM encryption
- SEC-2: Key never transmitted to server
- SEC-3: URL useless without key
- SEC-4: S3 SSE-S3 at rest
- SEC-6: Metadata displayed to user

API Endpoints:
- POST /transfers
- POST /transfers/{id}/complete
- GET /transfers/{id}
- GET /transfers/{id}/download
- POST /tokens
- GET /tokens
- DELETE /tokens/{id}

### Task 3: FastAPI Service Architectural Plan (Architect, P0)

Produce your architectural plan for the FastAPI service. This is a **Plan Mode exercise** — you will produce your plan independently, and a separate implementation plan will also be produced independently. The Human (Conductor) will then compare both, resolve any conflicts, and merge them into a final brief.

**Your plan should include:**
- System architecture diagram (how FastAPI, Lambda/Mangum, S3, API Gateway, CloudFront fit together)
- API contract for each endpoint (request schema, response schema, status codes, error format)
- Data model (S3 object structure: `transfers/{id}/meta.json`, `events.json`, `payload.enc`)
- Pre-signed URL flow (sequence diagram: client → API → S3 pre-signed URL → client → S3 direct)
- Lambda/serverless handler design (how FastAPI maps to Lambda via Mangum)
- Authentication model (token validation, admin key)
- Error handling strategy
- Technology choices and rationale for each decision

**Important:** Focus on the ARCHITECTURE, not the implementation code. Your audience is a developer who will build from your plan. Make it precise enough that there's no ambiguity about what each endpoint does, what it accepts, what it returns, and how the components connect.

### Task 4: Frontend UI Architectural Plan (Architect, P0)

Same Plan Mode exercise for the frontend:

**Your plan should include:**
- Page breakdown (upload, result, download, status, admin)
- Component structure per page
- Client-side encryption flow (Web Crypto API usage, key generation, encryption, decryption)
- Pre-signed URL upload flow from the browser's perspective
- Transparency panel design (what data, how displayed)
- Error handling UX (wrong key, expired transfer, network errors)
- Static hosting model (S3 + CloudFront)
- No JavaScript framework for MVP (vanilla JS + HTML + CSS) — rationale and structure

### Task 5: System Landscape Map (Cartographer, P1)

Map the full system topology:

```
Browser ──► CloudFront ──► S3 (static frontend)
                       ──► API Gateway ──► Lambda (FastAPI/Mangum)
                                              ├── S3 (transfer data)
                                              ├── S3 (config/tokens)
                                              └── (future: DynamoDB, SQS, etc.)
```

Include:
- Data flow for upload (client → API → pre-signed URL → client → S3)
- Data flow for download (client → API → pre-signed URL → client → S3 → client decrypts)
- Environment separation (dev/QA/prod S3 buckets, Lambda functions, CloudFront distributions)
- Security boundaries (what's public, what requires auth, what requires admin)

### Task 6: Issues FS Improvements (Librarian, Ongoing)

As you work through Tasks 1-5, note any friction or limitations in Issues FS. Propose improvements. Examples:
- Do we need a "Plan Mode" issue type?
- Do we need role-assignment fields on issues?
- Do we need dependency linking between tasks?
- Do we need a "phase" or "milestone" concept?

---

## 5. Plan Mode — How It Works

For Tasks 3 and 4 (FastAPI + UI plans), you are participating in a **Plan Mode exercise**:

1. **You produce your plan independently** — focusing on architecture, contracts, data models, and design rationale
2. **A separate implementation plan will also be produced independently** — focusing on how to build it, file structure, code patterns, and effort estimates
3. **The Human (Conductor) compares both plans** — identifies agreements and conflicts
4. **Conflicts are resolved** — the Human decides or facilitates discussion
5. **A final merged brief is created** — this becomes the authoritative implementation spec
6. **Implementation proceeds from the merged brief**

**Your focus in Plan Mode:** You are the Architect. Think about WHAT should be built and WHY. Define the contracts, the boundaries, the data models. Don't worry about the implementation details (that's the other plan's focus). Your plan should be precise enough that a developer can build from it without ambiguity, but abstract enough that it doesn't prescribe unnecessary implementation choices.

---

## 6. Working Principles

1. **Issues FS is your primary output** — every decision, task, and plan should be captured in Issues FS
2. **Structure over code** — your value is clarity and organisation, not lines of code
3. **The spec documents are reference material** — they contain the ideas; you create the actionable structure
4. **Phase 1 only** — resist the temptation to over-plan later phases. Get MVP structured and clear.
5. **Architecture Decision Records** — for any non-obvious decision, write an ADR explaining the decision, alternatives considered, and rationale
6. **Push Issues FS forward** — if the system doesn't support what you need, improve it
7. **Be opinionated** — you're the Architect. Have strong views on how things should be built. The Plan Mode process ensures your views are tested against an independent perspective.

---

## 7. Key Reference — MVP API Endpoints

For quick reference, here are the MVP endpoints you'll be designing contracts for:

```
POST   /transfers              Token auth → create transfer → return pre-signed upload URL
POST   /transfers/{id}/complete Token auth → mark upload done → return download link + transparency data
GET    /transfers/{id}          Public → transfer metadata + download count
GET    /transfers/{id}/download Public → pre-signed download URL + log download event
POST   /tokens                  Admin auth → create access token
GET    /tokens                  Admin auth → list tokens + usage stats
DELETE /tokens/{id}             Admin auth → revoke token
```

S3 Data Structure:
```
transfers/{transfer_id}/
├── meta.json      {status, created_at, sender_ip, file_size, token_id, expires_at}
├── events.json    [{type, timestamp, ip, user_agent}]
└── payload.enc    (encrypted binary blob — opaque to server)
```

Authentication:
- Sender: `Authorization: Bearer tok_xxx` (pre-distributed token)
- Receiver: No auth (content is encrypted; public download is safe)
- Admin: `Authorization: Bearer adm_xxx` (environment variable)

---

## 8. Success Criteria

You'll know you've succeeded when:

1. **The knowledge base is organised** — anyone can navigate Issues FS and understand what's in scope, what's deferred, and what's in progress
2. **Phase 1 has clear, actionable tasks** — every task has a description, acceptance criteria, role assignment, and priority
3. **The architectural plans are precise** — a developer can build from them without asking clarifying questions
4. **The system map exists** — the deployment topology, data flows, and security boundaries are visualised
5. **Issues FS has improved** — at least one meaningful improvement to Issues FS has been identified and proposed
6. **Plan Mode produces a merged brief** — your architectural plan and the independent implementation plan are successfully merged into a single authoritative spec

---

*This brief defines your roles and immediate tasks for the SGraph Send project. The six specification documents (brief, roadmap, plugins, LLM/compliance, strategic opportunities, naming) are your source material. Your job is to transform that material into structure, architecture, and actionable plans that enable rapid, high-quality implementation.*
