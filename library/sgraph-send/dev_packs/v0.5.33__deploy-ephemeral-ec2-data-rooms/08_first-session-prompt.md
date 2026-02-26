# First Session Prompt: SG_Send__Deploy

**version** v0.5.33
**date** 23 Feb 2026

---

## Prompt for Claude Code

Added to a new Claude Code session (in the SG_Send__Deploy repo):

---

```
You are bootstrapping a new project: SG_Send__Deploy — the deployment and infrastructure management layer for SGraph Send.

## Step 1: Read the Bootstrap Pack

Clone the main repo for reference and read the bootstrap pack:

git clone --depth 1 https://github.com/SGraph-AI/App__Send.git /tmp/sgraph-send-ref

Read these files from /tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.5.33__deploy-ephemeral-ec2-data-rooms/ in order:

1. 07_first-session-brief.md (orientation)
2. 01_project-context.md (what SG/Send is, what we're building)
3. 02_mission-brief.md (deliverables, timeline, phases)
4. 03_role-definitions/devops.md (lead role)
5. 03_role-definitions/developer.md
6. 03_role-definitions/architect.md
7. 03_role-definitions/appsec.md
8. 03_role-definitions/conductor.md
9. 04_practices-reference.md (coding patterns)
10. 05_technical-bootstrap-guide.md (repo structure, step-by-step)
11. 06_what-to-clone.md (what to reference from App__Send)
12. 09_claude-md-review.md (CLAUDE.md adaptation)

Then read these source briefs from /tmp/sgraph-send-ref/:

13. team/humans/dinis_cruz/briefs/02/21/part-3/v0.5.10__dev-brief__fastapi-ec2-management-routes.md
14. team/humans/dinis_cruz/briefs/02/21/part-3/v0.5.10__architecture__github-store-and-ephemeral-compute.md
15. team/humans/dinis_cruz/briefs/02/21/part-3/v0.5.10__product-brief__data-rooms.md

And these reference patterns:

16. /tmp/sgraph-send-ref/.claude/CLAUDE.md (project conventions)
17. /tmp/sgraph-send-ref/.claude/explorer/CLAUDE.md (explorer team rules)
18. /tmp/sgraph-send-ref/sgraph_ai_app_send/lambda__admin/Fast_API__Admin.py (FastAPI pattern)
19. /tmp/sgraph-send-ref/sgraph_ai_app_send/lambda__admin/routes/Routes__Tokens.py (route pattern)

## Step 2: Create the Repo Structure

Follow 05_technical-bootstrap-guide.md Phase 0 to create the directory structure.

## Step 3: Create .claude/CLAUDE.md

Follow 09_claude-md-review.md to create the project-wide guidance file.
Adapt from App__Send conventions for the Deploy context.

## Step 4: Create .claude/explorer/CLAUDE.md

Create Explorer team session rules. This is an Explorer-phase project.
5 roles: DevOps (lead), Developer, Architect, AppSec, Conductor.

## Step 5: Start Phase 1

Begin implementing EC2 management routes:
- Verify osbot-aws EC2 wrappers (what methods exist?)
- Implement Service__EC2_Instances (budget-controlled, audit-logged)
- Implement Routes__EC2_Instances (thin FastAPI wrappers)
- Test: create and terminate a real EC2 instance

## Context

- You are the Explorer team. Move fast, capture everything.
- Investor demo deadline: Thursday/Friday this week.
- The human is Dinis Cruz — project lead and decision-maker.
- PKI is already built (in App__Send). You're building the infrastructure to deploy it.
- Use osbot-aws for all AWS calls. Never raw boto3.
- Use Type_Safe for all schemas. Never Pydantic.
- Use Serverless__Fast_API for the management Lambda.
- Budget: max 5 EC2 instances, $10/day cap.
```

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
