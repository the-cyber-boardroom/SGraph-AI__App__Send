# CLAUDE.md Adaptation Guide: SG_Send__Deploy

**version** v0.5.33
**date** 23 Feb 2026

---

## Purpose

The Deploy repo needs its own `.claude/CLAUDE.md`. This document reviews App__Send's CLAUDE.md section-by-section and recommends what to keep, adapt, or skip.

---

## Source Files Reviewed

| File | Path in App__Send |
|------|-------------------|
| Global CLAUDE.md | `.claude/CLAUDE.md` |
| Explorer CLAUDE.md | `.claude/explorer/CLAUDE.md` |
| Villager CLAUDE.md | `.claude/villager/CLAUDE.md` |

---

## Section-by-Section Review: Global CLAUDE.md

### KEEP AS-IS

| Section | Why |
|---------|-----|
| **MEMORY.md Policy** | Same rule — don't use auto-memory, keep knowledge in repo |
| **Git conventions** | Same branching model, push rules |
| **File naming** | Same `{version}__{description}.md` pattern |
| **Human folders read-only** | Same rule — agents never write to `briefs/` |
| **Debrief protocol** | Same structure and relative link rules |

### ADAPT (Change for Deploy Context)

| Section | How to Adapt |
|---------|-------------|
| **Project description** | "SG_Send__Deploy — infrastructure management and ephemeral deployment for SGraph Send data rooms" |
| **Version file** | `sg_send_deploy/version` (starts at `0.1.0`) |
| **Stack table** | Same base (Python 3.12, FastAPI, Type_Safe, osbot-aws) but add: paramiko, no frontend (this is API-only) |
| **Architecture** | One Lambda function (Deploy management). Manages EC2 instances. No user-facing UI. |
| **Repo structure** | Use the structure from `05_technical-bootstrap-guide.md` |
| **Code patterns** | Same Type_Safe, osbot-aws, Memory-FS rules. Add: all EC2 calls via osbot-aws, budget checks before creates, audit all operations |
| **Testing** | Same no-mocks rule. Add: integration tests marked separately (they hit real AWS), budget controls tested with in-memory state |
| **Role system** | 5 roles: DevOps (lead), Developer, Architect, AppSec, Conductor |
| **Current state** | "v0.1.0 — initial bootstrap, EC2 management routes" |
| **Key documents** | Link to source briefs in App__Send (read-only reference) and this dev pack |

### SKIP (Not Applicable)

| Section | Why |
|---------|-----|
| **Three-team structure** | Deploy starts as Explorer-only. No Villager or Town Planner yet. |
| **Two Lambda functions** | Deploy has one management Lambda. |
| **Three UIs** | Deploy has no UI. API-only. Admin uses curl/Postman/future UI. |
| **7 deployment targets** | Deploy manages deployment of App__Send. It doesn't have 7 targets itself. |
| **Frontend rules** | No frontend in Deploy repo. |
| **IFD methodology** | No frontend, so IFD doesn't apply. |
| **Security section (encryption)** | The zero-knowledge encryption model applies to App__Send, not to Deploy. Deploy manages infrastructure. Different threat model. |
| **18 roles** | Deploy has 5 roles. |

---

## Review: Explorer CLAUDE.md

### KEEP (Adapt)

| Section | How to Adapt |
|---------|-------------|
| **Mission statement** | "Build the deployment infrastructure for ephemeral EC2 data rooms. Demo-ready by Thursday." |
| **What You DO** | Build EC2 management, AMI creation, DNS setup, config push, fleet management |
| **What You Do NOT Do** | Don't modify App__Send code. Don't deploy App__Send to production (that's a separate pipeline). Don't build UI. |
| **Explorer questions** | Same questions apply |
| **Handover protocol** | When infrastructure matures, hand over to Villager for hardening |

### SKIP

| Section | Why |
|---------|-----|
| **Current Explorer Priorities table** | Replace with Deploy-specific priorities (the 5 phases) |
| **Components Still Being Explored table** | Replace with Deploy components (EC2 routes, AMI, DNS, config push, fleet management) |
| **Architecture diagram** | Replace with Deploy architecture (management Lambda → EC2 instances) |

---

## Recommended Stack Table for Deploy

| Layer | Technology | Rule |
|-------|-----------|------|
| Runtime | Python 3.12 / arm64 | |
| Web framework | FastAPI via `osbot-fast-api-serverless` | Use `Serverless__Fast_API` base class |
| Lambda adapter | Mangum (via osbot-fast-api) | |
| AWS operations | `osbot-aws` | **Never use boto3 directly** |
| SSH client | `paramiko` | Pure Python, Lambda-compatible |
| Type system | `Type_Safe` from `osbot-utils` | **Never use Pydantic** |
| Storage | Memory-FS (`Storage_FS`) for state | Fleet state, audit logs |
| Testing | pytest, in-memory + integration | **No mocks, no patches** |
| CI/CD | GitHub Actions | Test → tag → deploy |

---

## Recommended Architecture Section

```
Deploy Management Lambda
├── /api/ec2/instances          (CRUD for EC2 instances)
├── /api/ec2/instances/{id}/exec (SSH operations via paramiko)
├── /api/ec2/amis               (AMI management)
├── /api/ec2/keypairs           (SSH key pair management)
├── /api/fleet/rooms            (Data room CRUD)
├── /api/fleet/rooms/{id}/start (Boot sequence)
├── /api/fleet/rooms/{id}/stop  (Shutdown + sync)
└── /info/health                (Health check)

     │
     │ manages
     ▼

EC2 Instances (data rooms)
├── SG/Send FastAPI server (port 443)
├── Memory-FS (loaded from S3)
├── PKI system
└── Branded UI

     │
     │ routes to
     ▼

DNS: {room-name}.send.sgraph.ai
```

---

## Recommended Role Section

| Role | Identity | Focus |
|------|----------|-------|
| **DevOps** (lead) | Infrastructure owner | EC2, AMIs, networking, DNS, Lambda |
| **Developer** | API builder | FastAPI routes, osbot-aws integration, services |
| **Architect** | System designer | Topology, API contracts, state machine |
| **AppSec** | Security reviewer | Threat model, blast radius, audit trail |
| **Conductor** | Product owner | Timeline, priorities, demo readiness |

---

## Sections to Write Fresh

| Section | Content |
|---------|---------|
| **EC2 Security Posture** | Port 443 only, zero egress, no IAM, sealed box. Reference v0.5.10 architecture brief. |
| **Budget Controls** | Max 5 instances, $10/day, 30-min idle timeout. Enforced in service layer. |
| **Audit Trail** | Hash-chained, append-only. Every EC2 operation logged with admin identity. |
| **Boot State Machine** | 6 states: NO_INSTANCE → BOOTING → RUNNING_VANILLA → READY → ACTIVE → SHUTTING_DOWN |
| **Integration with App__Send** | AMI is the boundary. Deploy builds/manages AMIs. App__Send is packaged into AMIs. |
| **Current Sprint** | Investor demo by Thursday. 5 phases. Phase plan from `02_mission-brief.md`. |

---

## Template: .claude/CLAUDE.md Structure

```
# SG_Send__Deploy — Agent Guidance

## MEMORY.md Policy
(same as App__Send)

## Project
(adapted description)

## Stack
(adapted table)

## Architecture
(Deploy-specific diagram)

## Repo Structure
(from 05_technical-bootstrap-guide.md)

## Key Rules
### Code Patterns (adapted)
### EC2 Security Posture (new)
### Budget Controls (new)
### Audit Trail (new)
### Testing (adapted)
### Git (same)

## Role System
(5 roles)

## Current State
(v0.1.0 — bootstrap)

## Key Documents
(links to source briefs + this dev pack)
```

## Template: .claude/explorer/CLAUDE.md Structure

```
# SG_Send__Deploy — Explorer Team Session

## Your Mission
(Deploy-specific: build deployment infrastructure, demo by Thursday)

## What You DO / Do NOT Do
(adapted for Deploy context)

## Team Composition
(5 roles)

## Current Priorities
(5 phases from mission brief)

## Architecture Context
(Deploy management Lambda → EC2 instances diagram)
```

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
