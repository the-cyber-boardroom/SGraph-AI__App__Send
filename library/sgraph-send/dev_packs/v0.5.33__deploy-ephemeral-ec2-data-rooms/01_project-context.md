# Project Context: SG/Send and Ephemeral Data Rooms

**version** v0.5.33
**date** 23 Feb 2026

---

## What Is SG/Send?

SGraph Send is a zero-knowledge encrypted file sharing platform at [send.sgraph.ai](https://send.sgraph.ai). Files are encrypted in the browser (AES-256-GCM, Web Crypto API) before upload. The decryption key never leaves the sender's device. The server only stores encrypted ciphertext.

**Current state (v0.5.33):** End-to-end MVP complete. Full transfer cycle works. Admin UI console shipped. PKI system built and working (key generation, encrypt/decrypt, key management UI). 111+ tests passing.

---

## What Has Been Built (in App__Send)

| Component | Status | Description |
|-----------|--------|-------------|
| **User Lambda** | Working | Public-facing: file upload, download, token-gated access |
| **Admin Lambda** | Working | API key authenticated: tokens, analytics, configuration |
| **User UI** | Working | Upload/download workflow, access gate, PKI integration |
| **Admin UI** | Working | Token management, PKI manager, personal vault, key discovery |
| **PKI System** | Working | Browser-based key generation (RSA/ECDSA/Ed25519), encrypt/decrypt, key management |
| **Memory-FS** | Working | Pluggable storage abstraction (memory, disk, S3 backends) |
| **7 deployment targets** | Designed | Lambda, Docker, Fargate, GCP Cloud Run, EC2, PyPI, CLI |

### What Has NOT Been Built Yet

| Component | Status | This Dev Pack's Focus |
|-----------|--------|----------------------|
| **EC2 management routes** | Designed (v0.5.10 brief) | **YES — primary deliverable** |
| **Lambda orchestrator** | Designed (v0.5.10 brief) | **YES — boot sequence** |
| **Data room provisioning** | Designed (v0.5.10 brief) | **YES — fleet management** |
| **AMI with SG/Send** | Not started | **YES — base image** |
| **Custom branding** | Partially (theming exists) | **YES — investor branding** |
| **DNS routing** | Not started | **YES — subdomain routing** |
| **Holding page** | Not started | **YES — boot UX** |

---

## The Architecture (What We're Building)

### Two Systems Working Together

```
SG_Send__Deploy (THIS REPO)              App__Send (EXISTING REPO)
┌─────────────────────────┐              ┌─────────────────────────┐
│                         │              │                         │
│  EC2 Management API     │              │  SG/Send Application    │
│  ├── Create instances   │    boots     │  ├── FastAPI server     │
│  ├── Push config        │───────────▶  │  ├── User routes        │
│  ├── Health checks      │              │  ├── Admin routes        │
│  ├── SSH operations     │              │  ├── Memory-FS           │
│  ├── Fleet management   │              │  ├── PKI system          │
│  └── Budget controls    │              │  └── Static UI           │
│                         │              │                         │
│  Lambda Orchestrator    │              │  (Runs ON the EC2        │
│  ├── Holding page       │              │   instance, loaded       │
│  ├── Boot sequence      │              │   from AMI)              │
│  ├── DNS routing        │              │                         │
│  └── Idle shutdown      │              └─────────────────────────┘
│                         │
│  AMI Builder            │
│  ├── Base image         │
│  └── SG/Send pre-loaded │
│                         │
└─────────────────────────┘
```

### The Data Room Lifecycle

```
1. Admin creates a data room via API
   POST /api/fleet/rooms  →  provisions DNS, links GitHub repo config

2. Someone visits investor-x.send.sgraph.ai
   CloudFront routes to Lambda orchestrator (no EC2 running)

3. Lambda shows holding page: "Booting your data room..."
   Creates EC2 from AMI, passes admin token

4. EC2 boots (~30-50 seconds)
   Lambda polls health check, shows progress

5. Lambda pushes config to EC2
   Branding, directory, encrypted files from S3

6. EC2 is READY
   DNS routes traffic to EC2, user sees data room

7. Idle timeout (30 min, configurable)
   Sync ephemeral data to S3, terminate instance

8. Back to step 2 — next visitor triggers fresh boot
```

---

## The Investor Context

### Who They Are

Two investor groups have independently validated the same use case:

- **Group 1** (from v0.4.12): Follow-up meeting pending. Want PKI demo, architecture document, Claude skill prototype.
- **Group 2** (from v0.5.10): Active. Sent documents for the human to review. Want **their own data room** deployed.

### What They Want to See

1. **PKI working** — key generation, encrypt/decrypt in the browser (DONE)
2. **A custom data room deployed for them** — branded, their documents in it, their URL
3. **Ephemeral infrastructure** — spins up on demand, costs nothing when idle
4. **The security story** — zero-knowledge, client-side encryption, sealed-box instances

### The Alchemist's Investment Narrative

The Alchemist (Town Planner team) positions EC2 ephemeral instances as serving three investor narratives:

| Narrative | Pitch |
|-----------|-------|
| **Cost Efficiency** | "Costs only when active" — per-hour billing, zero when idle |
| **Operational Flexibility** | 7 deployment targets, no vendor lock-in, multi-cloud from day one |
| **Demo Power** | "Showing a live EC2 instance serving the data room, even if manually provisioned, is powerful" |

The data room is the product. The GitHub repo is what customers buy. EC2 compute-hours are a direct billing line item in the revenue model.

---

## Key Technical Decisions (Already Made)

| Decision | Choice | Source |
|----------|--------|--------|
| EC2 management approach | FastAPI routes wrapping `osbot_aws.ec2` — no Terraform, no CloudFormation | v0.5.10 dev brief |
| SSH client in Lambda | `paramiko` (pure Python, Lambda-compatible) | v0.5.10 dev brief |
| Instance type | `t3.micro` default, `t3.medium` for larger rooms | v0.5.10 architecture |
| Security model | Port 443 inbound only, zero egress, no IAM role, sealed box | v0.5.10 architecture |
| Storage on instance | Memory-FS (in-memory), data pushed from S3 by Lambda | v0.5.10 architecture |
| Budget controls | Max 5 instances, $10/day cap, 30-min idle auto-terminate | v0.5.10 dev brief |
| AWS library | `osbot-aws` only — never raw `boto3` | Project-wide rule |
| Schema library | `Type_Safe` from `osbot-utils` — never Pydantic | Project-wide rule |
| Web framework | FastAPI via `osbot-fast-api` / `osbot-fast-api-serverless` | Project-wide rule |
| Audit trail | Hash-chained, append-only logs for all EC2 operations | v0.5.10 dev brief |
| DNS | `investor-x.send.sgraph.ai` subdomain pattern | v0.5.10 architecture |
| Config source | GitHub repo per data room, synced encrypted to S3 | v0.5.10 architecture |

---

## The EC2 Instance (What Runs on It)

The EC2 instance runs a standard SG/Send server (FastAPI):

| Component | What It Does |
|-----------|-------------|
| FastAPI server (port 443) | Serves data room UI, encrypted files, PKI operations, messaging |
| Memory-FS | In-memory file system loaded from S3 on boot |
| TLS certificate | Auto-provisioned or pre-baked in AMI |
| Admin API | One-time admin token for initial configuration (Lambda pushes config via this) |

**Security posture:**

| Property | Setting |
|----------|---------|
| Inbound | Port 443 only (HTTPS) |
| Outbound/Egress | None. Fully isolated. |
| Storage | Local instance storage only. No EBS volumes. |
| Data loading | Lambda pushes TO the instance. Instance never pulls. |
| SSH | Via paramiko from Lambda only (for management). Not exposed to internet. |
| IAM role | None or minimal. No AWS API access from instance. |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
