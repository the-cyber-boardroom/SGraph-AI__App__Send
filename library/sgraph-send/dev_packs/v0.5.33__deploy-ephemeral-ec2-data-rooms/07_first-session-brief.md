# First Session Brief: SG_Send__Deploy

**version** v0.5.33
**date** 23 Feb 2026

---

## Welcome

You're starting a new project: **SG_Send__Deploy** — the deployment and infrastructure management layer for SGraph Send.

This is a **separate repo** from `App__Send` (the application). Your repo manages EC2 instances, AMIs, DNS, and the orchestration that makes ephemeral data rooms possible.

**The deadline is Thursday/Friday this week.** An investor wants to see a custom data room deployed for them, with PKI. The PKI is built (in App__Send). You need to make the infrastructure work.

---

## Read These Documents In Order

| # | Document | Time | What You Learn |
|---|----------|------|---------------|
| 1 | This file | 2 min | Orientation, mission, timeline |
| 2 | `01_project-context.md` | 5 min | What SG/Send is, what exists, the architecture |
| 3 | `02_mission-brief.md` | 5 min | Deliverables, phased plan, success criteria |
| 4 | `03_role-definitions/` | 5 min | Your 5 roles: DevOps (lead), Developer, Architect, AppSec, Conductor |
| 5 | `04_practices-reference.md` | 3 min | Coding patterns from SG/Send |
| 6 | `05_technical-bootstrap-guide.md` | 10 min | Repo structure, step-by-step phases |
| 7 | `06_what-to-clone.md` | 3 min | What to reference from App__Send |
| 8 | `09_claude-md-review.md` | 5 min | How to create your `.claude/CLAUDE.md` |

**Total orientation: ~40 minutes.** Then start building.

---

## Your Mission (Summary)

1. **Create EC2 instances via FastAPI API** — admin-authenticated, budget-controlled, audit-logged
2. **Build an AMI with SG/Send pre-installed** — boots to FastAPI server on port 443
3. **Push config to running instances** — branding, directory, encrypted documents
4. **Set up DNS** — `investor-x.send.sgraph.ai` points to the running instance
5. **Demo-ready by Thursday** — investor visits URL, sees their branded data room

---

## Your Team

| Role | Identity | Lead? |
|------|----------|-------|
| **DevOps** | Infrastructure, EC2, AMIs, networking, DNS | **Lead role** |
| **Developer** | FastAPI routes, osbot-aws integration, service layer | |
| **Architect** | System topology, API contracts, state machine design | |
| **AppSec** | Threat modelling, security review, blast radius analysis | |
| **Conductor** | Timeline, priorities, scope control | |

DevOps leads because this is an infrastructure project. Developer writes the API. Architect designs the contracts. AppSec reviews. Conductor keeps the timeline.

---

## Phase Plan

| Phase | What | When | Hours |
|-------|------|------|-------|
| **0** | Repo bootstrap, verify osbot-aws, find base AMI | Sunday | 2-3h |
| **1** | EC2 management routes (create, list, terminate) | Sun-Mon | 4-6h |
| **2** | AMI with SG/Send, boots to working server | Monday | 4-6h |
| **3** | Config push (branding, directory, documents) | Mon-Tue | 4-6h |
| **4** | DNS + live investor data room | Tue-Wed | 4-6h |
| **5** | Demo polish, full rehearsal | Wednesday | 2-4h |

---

## Key Technical Decisions (Already Made)

| Decision | Choice |
|----------|--------|
| AWS library | `osbot-aws` only (never raw boto3) |
| Schema library | `Type_Safe` only (never Pydantic) |
| Web framework | FastAPI via `osbot-fast-api-serverless` |
| SSH client | `paramiko` (pure Python, Lambda-compatible) |
| Instance type | `t3.micro` default |
| Security | Port 443 inbound only, zero egress, no IAM role |
| Budget | Max 5 instances, $10/day cap, 30-min idle auto-terminate |
| DNS pattern | `{room-name}.send.sgraph.ai` |

---

## What NOT to Do

| Don't | Why |
|-------|-----|
| Don't build a full fleet management UI | One investor, one data room. Manual is fine. |
| Don't automate GitHub → S3 sync | Upload documents manually for the demo |
| Don't multi-region | Single region is enough for the demo |
| Don't optimise boot time | 30-50 seconds is acceptable |
| Don't build the holding page first | Boot the instance before the meeting instead |
| Don't copy App__Send code into this repo | The AMI contains the application. This repo manages infrastructure. |

---

## Success Metrics: End of First Session

- [ ] Repo created with correct directory structure
- [ ] `.claude/CLAUDE.md` exists with Deploy-specific guidance
- [ ] Dependencies install cleanly (osbot-aws, osbot-fast-api, paramiko)
- [ ] `osbot-aws` EC2 wrappers verified — can list instances, describe AMIs
- [ ] At least one FastAPI route implemented (`GET /api/ec2/instances`)
- [ ] Base AMI identified (Amazon Linux 2023 arm64 or similar)
- [ ] Test instance created and terminated successfully via `osbot-aws`

---

## The Investor Story (for Context)

The Alchemist (Town Planner team) frames ephemeral EC2 data rooms as three investor narratives:

1. **Cost Efficiency**: "Costs only when active." Per-hour billing. Zero when idle.
2. **Operational Flexibility**: 7 deployment targets, multi-cloud, no lock-in.
3. **Demo Power**: "Here's your data room. We built it for you. Your documents are in it. Try it."

The demo you're building IS the sales pitch. Not a slide deck — the working product, configured for the investor, running on their own infrastructure.

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
