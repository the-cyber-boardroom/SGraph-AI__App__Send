# Mission Brief: Ephemeral EC2 Data Rooms — Investor Demo

**version** v0.5.33
**date** 23 Feb 2026
**urgency** Demo required by Thursday/Friday this week
**from** Human (project lead)
**to** DevOps (lead), Developer, Architect, AppSec, Conductor

---

## Mission Statement

Build and deploy a working ephemeral EC2 data room that can be demoed to investors this week. The investor asked to see PKI (done) and a custom data room deployed for them. We need to deliver both.

**Move fast. Ship the demo. Capture everything for productisation later.**

---

## What We're Delivering

### The Demo Script

| Step | What the Investor Sees | What's Happening |
|------|------------------------|------------------|
| 1 | "Here's your data room: `investor-x.send.sgraph.ai`" | DNS points to Lambda orchestrator |
| 2 | Investor clicks link, sees holding page | Lambda creates EC2 from AMI |
| 3 | "Booting your data room..." (30-50 seconds) | EC2 starting, Lambda polling health |
| 4 | Data room loads with investor's branding | Config pushed, traffic routed to EC2 |
| 5 | Investor sees their documents, PKI-secured | Encrypted files served from Memory-FS |
| 6 | Two-way document exchange, messaging | Full SG/Send capability running |
| 7 | After the meeting, instance shuts down | Auto-terminate, back to zero cost |

### Minimum Viable Demo (Must Have by Thursday)

| # | Deliverable | Description |
|---|-------------|-------------|
| 1 | **EC2 instance boots SG/Send** | AMI with SG/Send pre-installed, boots to FastAPI server on port 443 |
| 2 | **Admin API creates instances** | `POST /api/ec2/instances` creates and starts an EC2 instance |
| 3 | **Config push works** | Push branding, directory, and encrypted files to a running instance |
| 4 | **Branded URL** | `investor-x.send.sgraph.ai` resolves to the running instance |
| 5 | **PKI works in the data room** | Key generation, encrypt/decrypt — already built, just needs to work on EC2 |
| 6 | **Documents pre-loaded** | Investor's documents uploaded and accessible in the data room |

### Stretch Goals (Nice to Have)

| # | Deliverable | Description |
|---|-------------|-------------|
| 7 | Holding page with boot progress | Lambda serves "booting..." page, auto-refreshes until ready |
| 8 | Auto-shutdown on idle | 30-minute idle timer, auto-terminate |
| 9 | Fleet management UI | Admin page listing data rooms and their status |
| 10 | Full boot automation | One-click: create room, boot instance, push config, route DNS |

---

## Phased Plan

### Phase 0: Repo Bootstrap (Sunday — 2-3 hours)

- Create `SG_Send__Deploy` repo
- Set up `.claude/CLAUDE.md` with Deploy-specific guidance
- Set up Python environment, dependencies
- Verify `osbot-aws` EC2 wrappers work (create, start, stop, terminate a test instance)
- Identify or create base AMI with Python 3.12 + SG/Send dependencies

### Phase 1: EC2 Management Routes (Sunday-Monday — 4-6 hours)

- Implement FastAPI routes for instance lifecycle (`/api/ec2/instances`)
- Create, list, start, stop, terminate via API
- Budget controls (max instances, daily cap)
- Audit logging for all operations
- **Test**: can you create an instance via API and see it running in AWS console?

### Phase 2: AMI + SG/Send Server (Monday — 4-6 hours)

- Create or identify base AMI (Amazon Linux 2023 or Ubuntu 22.04 arm64)
- Install Python 3.12, SG/Send application, dependencies
- Configure SG/Send to start on boot (systemd service)
- TLS: use self-signed cert initially, or ACM for the subdomain
- **Test**: boot the AMI manually, hit port 443, see SG/Send running

### Phase 3: Config Push + Branding (Monday-Tuesday — 4-6 hours)

- Implement SSH/admin API config push from management Lambda
- Push branding (logo, colours, theme)
- Push directory (investor personas, public keys)
- Push encrypted documents (pre-uploaded to S3)
- **Test**: push config to running instance, see branded data room

### Phase 4: DNS + Investor Data Room (Tuesday-Wednesday — 4-6 hours)

- Set up Route53 subdomain: `investor-x.send.sgraph.ai`
- Point to running EC2 instance (or CloudFront distribution)
- Pre-load investor's documents
- Add investor contacts to directory
- **Test**: visit `investor-x.send.sgraph.ai`, see branded data room with documents

### Phase 5: Demo Polish (Wednesday — 2-4 hours)

- Full run-through of demo script
- Fix any issues
- Holding page (stretch)
- Auto-shutdown (stretch)
- Brief the human on the demo flow

---

## Success Criteria

### After Phase 2 (end of Monday)

- [ ] Can create EC2 instances via FastAPI API
- [ ] AMI boots and serves SG/Send on port 443
- [ ] Budget controls prevent runaway costs
- [ ] All operations logged

### After Phase 4 (end of Wednesday)

- [ ] `investor-x.send.sgraph.ai` resolves to a working data room
- [ ] Data room shows investor's branding
- [ ] PKI works (key generation, encrypt/decrypt)
- [ ] Pre-loaded documents are accessible
- [ ] Human can walk through demo script end-to-end

### Demo Day (Thursday/Friday)

- [ ] Investor visits their URL, sees their branded data room
- [ ] Documents are there, PKI-secured
- [ ] Two-way exchange works (investor can upload/send back)
- [ ] After the meeting, instance can be terminated (manual is fine)

---

## What We Do NOT Do This Week

| Don't | Why |
|-------|-----|
| Don't build the full fleet management API | Overkill for one investor demo |
| Don't automate GitHub → S3 sync | Manual upload is fine this week |
| Don't build the holding page boot sequence | Nice to have but not critical — can boot instance before the meeting |
| Don't implement auto-shutdown | Manual terminate is fine for the demo |
| Don't build the SG/Send CLI | Not needed for this demo |
| Don't optimise boot time | 30-50 seconds is acceptable |
| Don't multi-region | Single region (eu-west-1 or us-east-1) is enough |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| AMI takes too long to build | Delays all subsequent phases | Start AMI work in Phase 0, test early |
| TLS certificate issues | Data room won't load over HTTPS | Use ACM + CloudFront, or self-signed for demo |
| osbot-aws EC2 wrappers don't cover all needed operations | Need to write raw wrappers | Check coverage in Phase 0, file issues early |
| DNS propagation delay | Subdomain not reachable in time | Set up DNS early (Monday), use low TTL |
| Instance security group misconfigured | Can't reach port 443 | Pre-create security group with known-good config |
| SG/Send won't start on EC2 | Blocks demo entirely | Test AMI manually before automating |

---

## Cost Budget

| Item | Estimate | Notes |
|------|----------|-------|
| EC2 t3.micro (dev/test) | ~$0.01/hr | Multiple instances during development |
| EC2 t3.micro (demo) | ~$0.01/hr | One instance for the investor demo |
| Route53 hosted zone | $0.50/mo | For subdomain |
| S3 storage | < $0.01 | Encrypted documents |
| **Total for the week** | **< $5** | Budget cap: $10/day in the management API |

---

This document is released under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
