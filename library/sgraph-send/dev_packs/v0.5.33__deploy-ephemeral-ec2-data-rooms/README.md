# Dev Pack: Ephemeral EC2 Data Room Deployment

**version** v0.5.33
**date** 23 Feb 2026
**target repo** `SG_Send__Deploy`
**urgency** Investor demo this week (W/C 24 Feb 2026)

---

## Purpose

Bootstrap a new standalone repo (`SG_Send__Deploy`) focused on deploying ephemeral EC2 instances that serve SG/Send data rooms on demand. This is the deployment pipeline — separate from the application code.

**The investor demo**: show a custom-branded data room running on a dedicated EC2 instance, with PKI-secured access, that spins up on demand and costs nothing when idle.

---

## Reading Order

| # | Document | What It Covers |
|---|----------|---------------|
| 1 | `07_first-session-brief.md` | Start here — orientation, mission, timeline |
| 2 | `01_project-context.md` | What SG/Send is, what exists today, what the investors want |
| 3 | `02_mission-brief.md` | Deliverables, success criteria, phased plan |
| 4 | `03_role-definitions/` | 5 roles: DevOps (lead), Developer, Architect, AppSec, Conductor |
| 5 | `04_practices-reference.md` | Patterns and conventions from the main SG/Send repo |
| 6 | `05_technical-bootstrap-guide.md` | Step-by-step: repo structure, dependencies, phases |
| 7 | `06_what-to-clone.md` | What to reference/copy from `SGraph-AI/App__Send` |
| 8 | `08_first-session-prompt.md` | Copy-paste prompt to start the first Claude Code session |
| 9 | `09_claude-md-review.md` | How to adapt SG/Send's CLAUDE.md for the Deploy repo |

---

## Related Source Documents (in SGraph-AI/App__Send)

| Document | Path (relative to App__Send root) |
|----------|----------------------------------|
| FastAPI EC2 Management Routes | `team/humans/dinis_cruz/briefs/02/21/part-3/v0.5.10__dev-brief__fastapi-ec2-management-routes.md` |
| GitHub-as-Store + Ephemeral Compute | `team/humans/dinis_cruz/briefs/02/21/part-3/v0.5.10__architecture__github-store-and-ephemeral-compute.md` |
| Data Room Product Brief | `team/humans/dinis_cruz/briefs/02/21/part-3/v0.5.10__product-brief__data-rooms.md` |
| PKI Strategy + Investor Deployment | `team/humans/dinis_cruz/briefs/02/20/v0.4.17__brief__pki-strategy-and-investor-deployment.md` |
| Data Room UX + Fleet Management | `team/humans/dinis_cruz/briefs/02/21/part-3/v0.5.10__dev-brief__data-room-ux-and-fleet-management.md` |
| Alchemist Role Definition | `team/humans/dinis_cruz/briefs/02/21/part-1/v0.5.8__role-definition__alchemist.md` |
| Investor Briefing Pack | `library/alchemist/materials/v0.5.8__investor-briefing-pack__pki-milestone.md` |

---

## Timeline

| Day | Target |
|-----|--------|
| **Sunday (today)** | Repo created, EC2 management routes working locally, AMI identified |
| **Monday** | EC2 instances boot via API, push config works, basic data room serves |
| **Tuesday** | Branded data room live at `investor-x.send.sgraph.ai`, holding page + boot sequence |
| **Wednesday** | Full demo rehearsal: create room, boot instance, show PKI, exchange documents |
| **Thursday-Friday** | Investor meeting ready. Buffer for issues. |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
