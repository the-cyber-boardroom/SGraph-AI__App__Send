# What to Clone from App__Send

**version** v0.5.33
**date** 23 Feb 2026

---

## Clone the Main Repo (Read-Only Reference)

```bash
git clone --depth 1 https://github.com/SGraph-AI/App__Send.git /tmp/sgraph-send-ref
```

Use this as a **read-only reference**. Don't copy code wholesale — understand patterns, then implement fresh.

---

## Read and Understand (Don't Copy)

These files establish patterns you must follow:

| What | Path in App__Send | Why |
|------|-------------------|-----|
| **Project guidance** | `.claude/CLAUDE.md` | Conventions, rules, stack decisions |
| **Explorer session rules** | `.claude/explorer/CLAUDE.md` | Team composition, priorities, handover protocol |
| **FastAPI server pattern** | `sgraph_ai_app_send/lambda__admin/Fast_API__Admin.py` | How to structure a `Serverless__Fast_API` app |
| **Route pattern** | `sgraph_ai_app_send/lambda__admin/routes/Routes__Tokens.py` | How to write FastAPI routes with admin auth |
| **Service pattern** | `sgraph_ai_app_send/lambda__admin/actions/Service__Tokens.py` | How to write service classes with `Type_Safe` |
| **Schema pattern** | `sgraph_ai_app_send/lambda__admin/schemas/` | How to define `Type_Safe` data models |
| **Test pattern** | `tests/unit/lambda__admin/` | How to write tests (no mocks, real implementations) |
| **Memory-FS usage** | `sgraph_ai_app_send/lambda__admin/actions/Service__Storage.py` | How to use `Storage_FS` abstraction |
| **Lambda handler** | `sgraph_ai_app_send/lambda__admin/handler.py` | How to wrap FastAPI with Mangum |
| **Session start hook** | `.claude/hooks/session-start.sh` | How to bootstrap a dev environment |

---

## Read the Source Briefs (Essential Context)

These briefs define what you're building:

| Brief | Path in App__Send |
|-------|-------------------|
| **FastAPI EC2 Management Routes** | `team/humans/dinis_cruz/briefs/02/21/part-3/v0.5.10__dev-brief__fastapi-ec2-management-routes.md` |
| **GitHub-as-Store + Ephemeral Compute** | `team/humans/dinis_cruz/briefs/02/21/part-3/v0.5.10__architecture__github-store-and-ephemeral-compute.md` |
| **Data Room Product Brief** | `team/humans/dinis_cruz/briefs/02/21/part-3/v0.5.10__product-brief__data-rooms.md` |
| **PKI Strategy + Investor Deployment** | `team/humans/dinis_cruz/briefs/02/20/v0.4.17__brief__pki-strategy-and-investor-deployment.md` |
| **Data Room UX + Fleet Management** | `team/humans/dinis_cruz/briefs/02/21/part-3/v0.5.10__dev-brief__data-room-ux-and-fleet-management.md` |

**These briefs contain the complete API route tables, security models, architecture diagrams, and acceptance criteria.** Read them thoroughly.

---

## Adapt for Deploy Repo (Copy and Modify)

| What | Source in App__Send | How to Adapt |
|------|-------------------|--------------|
| **Session start hook** | `.claude/hooks/session-start.sh` | Same pattern — `uv venv`, install deps, set PYTHONPATH |
| **CI workflow structure** | `.github/workflows/` | Adapt for Deploy repo's test/deploy pipeline |
| **Auth middleware** | `sgraph_ai_app_send/lambda__admin/` (admin auth pattern) | Same API key auth for EC2 management routes |

---

## What NOT to Clone

| Don't Copy | Why |
|------------|-----|
| `team/humans/dinis_cruz/briefs/` | Human-only. Read-only reference. Never copy into Deploy repo. |
| `sgraph_ai_app_send/` application code | This is the app. Deploy repo manages infrastructure, not application code. |
| Unit tests from App__Send | Different domain. Write fresh tests for EC2 management. |
| User/Admin UI code | The UI runs on the EC2 instance (from AMI). Deploy repo doesn't serve UI. |
| Role review documents | These belong to App__Send's team structure. Deploy repo has its own. |
| `.issues/` | Deploy repo gets its own issue tracking. |

---

## The AMI: Where App__Send Meets Deploy

The AMI is the integration point between the two repos:

```
App__Send code  →  packaged into AMI  →  managed by Deploy repo
```

The Deploy repo needs to know:
1. **How to build the AMI** — what to install, how to configure
2. **How to start SG/Send** — the systemd service, the port, the health check endpoint
3. **How to push config** — the admin API endpoints on the running instance

But the Deploy repo does **not** modify application code. If SG/Send needs a change to support data room deployment, that change happens in App__Send and a new AMI is built.

---

## osbot-aws EC2 Reference

Before writing any EC2 code, explore what already exists:

```python
# In a Python session with osbot-aws installed:
from osbot_aws.aws.ec2.EC2           import EC2
from osbot_aws.aws.ec2.EC2_Instance  import EC2_Instance
from osbot_aws.aws.ec2.EC2_AMI       import EC2_AMI

# Check available methods
print([m for m in dir(EC2()) if not m.startswith('_')])
print([m for m in dir(EC2_Instance()) if not m.startswith('_')])
print([m for m in dir(EC2_AMI()) if not m.startswith('_')])
```

**The human built these wrappers.** Use them. If something is missing, write a thin extension — don't bypass to `boto3`.

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
