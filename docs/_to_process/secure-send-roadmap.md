# Secure Send — Roadmap & Expansion Plans

**Version:** 1.0 DRAFT  
**Date:** February 2026  
**Parent Brief:** `secure-send-brief.md`  
**Repo:** `MGraph-AI__App__Secure_Send`  
**Tracking:** All items below map to Issues FS issues  

---

## 1. Executive Summary

This document captures the post-MVP vision for Secure Send, extending it from a single hosted SaaS into a **deploy-anywhere, self-hostable platform** with built-in billing, security intelligence, browser fingerprint transparency, bot detection, and per-request cost tracking. The overarching theme is: **radical transparency** — show users everything we know about them, everything we store, and exactly what each operation costs.

These features are organised into workstreams, prioritised, and designed to be captured as Issues FS issues for agentic execution.

---

## 2. Priority Order

| Priority | Workstream | Rationale |
|----------|-----------|-----------|
| **P0** | MVP (see main brief) | Ship it, get it usable |
| **P1** | Deploy-Everywhere | Maximise adoption surface; self-hosting unlocks enterprise |
| **P2** | Cost Tracking & Transparency | Foundation for billing; operator visibility |
| **P3** | Billing & Credits | Revenue enablement |
| **P4** | Browser Fingerprint Transparency | Differentiator; privacy education |
| **P5** | Security Intelligence & IDS | IP enrichment, threat detection |
| **P6** | Bot & Abuse Detection | Platform resilience |

---

## 3. Workstream: Deploy-Everywhere

### 3.1 Vision

Secure Send should be deployable anywhere, by anyone, in minutes. The hosted SaaS at `send.example.com` is just one instance of the same package that anyone can run internally. This is both a product strategy (enterprise self-hosting) and an engineering discipline (if it deploys everywhere, it's properly decoupled).

### 3.2 Deployment Targets

| Target | Artefact | Distribution | Use Case |
|--------|----------|-------------|----------|
| **PyPI** | `pip install secure-send` | pypi.org | Developer-friendly, local dev, scripting |
| **Docker** | `docker run mgraph/secure-send` | Docker Hub | Self-hosted, internal deployment, CI/CD |
| **AWS AMI** | Pre-baked EC2 image | AWS Marketplace | One-click enterprise deployment |
| **EC2 (bare)** | CloudFormation / Terraform | GitHub releases | Custom AWS deployment on raw compute |
| **Lambda (M-Graph)** | Serverless deployment | M-Graph CLI | The default SaaS hosting model |
| **Container (ECS/Fargate)** | Docker on managed containers | ECR + ECS task def | AWS-native container deployment |

### 3.3 Architecture Implications

For deploy-everywhere to work, the application must be structured as:

```
secure-send/
├── core/                    # Pure Python — no cloud dependencies
│   ├── transfers.py         # Transfer logic (create, complete, status)
│   ├── tokens.py            # Token management
│   ├── events.py            # Event recording
│   └── crypto_validation.py # Ciphertext validation
│
├── storage/                 # Storage abstraction layer
│   ├── base.py              # Abstract storage interface
│   ├── s3.py                # AWS S3 implementation
│   ├── local_fs.py          # Local filesystem (for self-hosted/Docker)
│   └── gcs.py               # Future: Google Cloud Storage
│
├── api/                     # FastAPI application
│   ├── app.py               # FastAPI app (cloud-agnostic)
│   ├── routes/              # Route definitions
│   └── middleware/           # Token auth, CORS, logging
│
├── adapters/                # Deployment adapters
│   ├── lambda_handler.py    # Mangum adapter (M-Graph/Lambda)
│   ├── uvicorn_runner.py    # Direct uvicorn (Docker, EC2, PyPI)
│   └── cli.py               # CLI entry point
│
├── Dockerfile               # Multi-stage Docker build
├── pyproject.toml           # PyPI package config
├── packer/                  # AMI build (Packer)
│   └── secure-send.pkr.hcl
└── deploy/
    ├── cloudformation/      # CFn templates
    ├── terraform/           # TF modules
    └── mgraph/              # M-Graph config (dev/qa/prod)
```

**Key design principle:** `core/` and `api/` must have ZERO cloud-specific imports. All cloud interaction goes through `storage/` abstraction. This means:

- `pip install secure-send` gives you a working server backed by local filesystem
- `docker run` uses local filesystem by default, S3 via env vars
- Lambda deployment uses S3 via M-Graph config
- EC2/AMI uses S3 or local filesystem depending on config

### 3.4 Configuration Model

```bash
# Local / Docker (filesystem storage)
SECURE_SEND_STORAGE=local
SECURE_SEND_DATA_DIR=/data/secure-send

# AWS (S3 storage)
SECURE_SEND_STORAGE=s3
SECURE_SEND_S3_BUCKET=secure-send-prod-eu-west-1-data
SECURE_SEND_S3_REGION=eu-west-1

# Common
SECURE_SEND_MAX_FILE_SIZE=104857600    # 100MB
SECURE_SEND_DEFAULT_EXPIRY=604800      # 7 days
SECURE_SEND_ADMIN_KEY=adm_xyz789
```

### 3.5 Issues FS Tree

```
STORY: Deploy-Everywhere — PyPI distribution
├── TASK: Create pyproject.toml with CLI entry point
├── TASK: Implement local filesystem storage backend
├── TASK: Implement `secure-send serve` CLI command (uvicorn)
├── TASK: Implement `secure-send create-token` CLI command
├── TASK: Publish to PyPI
└── TEST: pip install + serve + upload/download cycle

STORY: Deploy-Everywhere — Docker
├── TASK: Multi-stage Dockerfile (slim Python base)
├── TASK: docker-compose.yml with volume mounts
├── TASK: Push to Docker Hub (mgraph/secure-send)
├── TASK: Health check in Docker HEALTHCHECK
└── TEST: docker run + full transfer flow

STORY: Deploy-Everywhere — AWS Marketplace AMI
├── TASK: Packer template for Amazon Linux 2023
├── TASK: systemd service unit for secure-send
├── TASK: First-boot configuration script
├── TASK: AWS Marketplace listing (metadata, pricing, EULA)
└── TEST: Launch AMI → full transfer flow

STORY: Deploy-Everywhere — Storage abstraction layer
├── TASK: Define abstract storage interface (get, put, list, delete, presign)
├── TASK: Implement S3 backend
├── TASK: Implement local filesystem backend
├── TASK: Storage factory (env var → backend instance)
└── TEST: All API tests pass against both backends

STORY: Deploy-Everywhere — CloudFormation / Terraform
├── TASK: CFn template (EC2 + S3 + IAM)
├── TASK: Terraform module (same resources)
└── TEST: Deploy from clean account using each template
```

---

## 4. Workstream: Cost Tracking & Transparency

### 4.1 Vision

Every request, every file transfer, every S3 operation should have a known, tracked cost. The operator should be able to answer: **"How much did it cost me to serve that 50MB file?"** down to the fraction of a penny. This is the foundation for the billing system — you can't price what you can't measure.

### 4.2 Cost Model

| Component | Cost Driver | Measurement |
|-----------|------------|-------------|
| **Lambda invocation** | Per request + duration × memory | CloudWatch metrics, tagged |
| **API Gateway** | Per request | CloudWatch metrics |
| **S3 PUT** | Per upload | S3 request metrics |
| **S3 GET** | Per download | S3 request metrics |
| **S3 storage** | Per GB/month, pro-rated per file × duration | Bucket metrics, per-prefix |
| **S3 transfer out** | Per GB downloaded | CloudWatch / S3 metrics |
| **CloudFront** | Per request + per GB transfer | CF metrics |
| **Total per transfer** | Sum of all above for upload + N downloads | Computed |

### 4.3 Per-Transfer Cost Tracking

Each transfer gets a `cost.json` alongside its `meta.json`:

```json
{
  "transfer_id": "abc123",
  "costs": {
    "upload": {
      "lambda_invocations": 2,
      "lambda_duration_ms": 450,
      "s3_put_requests": 1,
      "s3_bytes_stored": 4821033,
      "estimated_cost_usd": 0.000042
    },
    "downloads": [
      {
        "timestamp": "2026-02-08T16:45:00Z",
        "lambda_invocations": 2,
        "lambda_duration_ms": 300,
        "s3_get_requests": 1,
        "s3_transfer_bytes": 4821033,
        "estimated_cost_usd": 0.000051
      }
    ],
    "storage": {
      "bytes": 4821033,
      "days_stored": 3,
      "estimated_cost_usd": 0.000001
    },
    "total_estimated_cost_usd": 0.000094
  }
}
```

### 4.4 AWS Account Isolation & Tagging

```
All resources tagged:
  project:     secure-send
  tier:        dev | qa | prod
  workstream:  core | billing | security | fingerprint
  cost-centre: secure-send-ops

AWS Cost Explorer:
  → Group by tag: project + tier
  → Filter: secure-send
  → Granularity: daily

CloudWatch Metrics (custom):
  Namespace: SecureSend/Costs
  Dimensions: TransferId, TokenId, Region, Tier
  Metrics: EstimatedCostUSD, FileSizeBytes, RequestCount
```

Deployed in a **dedicated AWS account** (or at minimum a dedicated region with strict tagging) so costs are isolated and attributable with zero ambiguity.

### 4.5 Issues FS Tree

```
STORY: Cost Tracking — per-transfer cost model
├── TASK: Define cost model (rates per service, formula)
├── TASK: Implement cost calculation module
├── TASK: Generate cost.json per transfer
├── TASK: Add cost summary to admin stats endpoint
└── TEST: Verify cost calculation accuracy against AWS billing

STORY: Cost Tracking — AWS resource tagging
├── TASK: Tag all resources (project, tier, workstream, cost-centre)
├── TASK: Set up Cost Explorer with tag-based grouping
├── TASK: Create cost alerting (Budget: threshold alerts)
└── TEST: Verify all resources appear in Cost Explorer by tag

STORY: Cost Tracking — operator cost dashboard
├── TASK: Add cost-per-transfer to admin dashboard
├── TASK: Add aggregate cost metrics (daily, weekly, monthly)
├── TASK: Add cost-per-token breakdown (which users cost what)
└── TEST: Dashboard matches AWS billing within 5% margin
```

---

## 5. Workstream: Billing & Credits

### 5.1 Vision

Users buy credits, credits are consumed per transfer. Simple consumption-based model with a markup on infrastructure costs.

### 5.2 Pricing Model (Target)

| File Size | User Cost | Infra Cost (est.) | Margin |
|-----------|----------|-------------------|--------|
| < 10MB | £0.10 | ~£0.0001 | ~99.9% |
| 10–50MB | £0.25 | ~£0.001 | ~99.6% |
| 50–100MB | £0.50 | ~£0.005 | ~99.0% |
| 100–500MB | £1.00 | ~£0.05 | ~95.0% |

*Margins are high because the value is convenience + privacy, not raw storage. Adjust based on market testing.*

### 5.3 Credit System

```
1 credit = £1.00
Transfer cost = ceil(file_size_mb / 50) × 0.25 credits

Examples:
  5MB file   → 0.25 credits (£0.25)
  30MB file  → 0.25 credits (£0.25)
  75MB file  → 0.50 credits (£0.50)
  200MB file → 1.00 credits (£1.00)
```

### 5.4 Implementation

| Component | Technology | Notes |
|-----------|-----------|-------|
| Payment | Stripe Checkout | Buy credit packs (£5, £10, £25) |
| Credit ledger | S3 (or DynamoDB) | `tokens/{token_id}/credits.json` |
| Deduction | Lambda (on transfer creation) | Atomic check-and-deduct |
| Receipts | Stripe | Automatic email receipts |
| Dashboard | Admin UI | Credit balance, purchase history, usage |

### 5.5 Issues FS Tree

```
STORY: Billing — credit purchase flow
├── TASK: Stripe integration (Checkout Sessions)
├── TASK: Webhook handler (payment success → credit ledger)
├── TASK: Credit ledger data model (purchases, deductions, balance)
├── TASK: Build "Buy Credits" UI page
└── TEST: E2E — purchase credits via Stripe test mode

STORY: Billing — credit deduction on transfer
├── TASK: Check credit balance before upload (reject if insufficient)
├── TASK: Deduct credits on transfer completion
├── TASK: Add credit balance to token info
└── TEST: Functional — transfer rejected when credits exhausted

STORY: Billing — credit dashboard
├── TASK: Build credit balance + history UI
├── TASK: Add top-up prompt when balance is low
└── TEST: Functional — balance reflects purchases and usage
```

---

## 6. Workstream: Browser Fingerprint Transparency

### 6.1 Vision

Show the user **everything we can detect about them** just from visiting the page. Not to be creepy — to be educational. Most users have no idea how much information their browser leaks. Secure Send turns this into a transparency feature: "Here's what any website can see about you. We're showing you because we believe you should know."

### 6.2 Fingerprint Data Points

| Signal | Source | Passive? | Example |
|--------|--------|----------|---------|
| IP address | Server-side (request header) | Yes | `203.0.113.42` |
| Geolocation (IP-based) | IP data service (e.g. ipdata.co) | Yes | London, UK |
| ISP / ASN | IP data service | Yes | BT, AS2856 |
| Threat score | IP data service | Yes | Low / Medium / High |
| VPN/Proxy detection | IP data service | Yes | `is_vpn: true` |
| User-Agent | Request header | Yes | Chrome 121, macOS 14.2 |
| Screen resolution | `window.screen` | Client JS | 2560×1440 |
| Language | `navigator.language` | Client JS | en-GB |
| Timezone | `Intl.DateTimeFormat` | Client JS | Europe/London |
| Platform | `navigator.platform` | Client JS | MacIntel |
| Hardware concurrency | `navigator.hardwareConcurrency` | Client JS | 10 cores |
| Device memory | `navigator.deviceMemory` | Client JS | 16 GB |
| WebGL renderer | WebGL API | Client JS | Apple M1 Pro |
| Canvas fingerprint | Canvas API hash | Client JS | `a3f9c2...` |
| Installed fonts (sample) | Canvas measurement | Client JS | Helvetica, Arial, ... |
| Do Not Track | `navigator.doNotTrack` | Client JS | `1` (enabled) |
| Cookie support | `navigator.cookieEnabled` | Client JS | true |
| Touch support | `navigator.maxTouchPoints` | Client JS | 0 (desktop) |
| Battery status | Battery API (if available) | Client JS | 87%, not charging |
| Connection type | Network Information API | Client JS | wifi, 50 Mbps |

### 6.3 Transparency UI

```
┌──────────────────────────────────────────────────────────────┐
│  🔍 What we can tell about you (just from this page visit)   │
│                                                              │
│  ─── From your connection ───                                │
│  IP address:        203.0.113.42                             │
│  Location:          London, United Kingdom                   │
│  ISP:               BT (AS2856)                              │
│  VPN detected:      No                                       │
│  Threat level:      Low ✅                                    │
│                                                              │
│  ─── From your browser ───                                   │
│  Browser:           Chrome 121 on macOS 14.2                 │
│  Screen:            2560×1440 @ 2x                           │
│  Language:          English (GB)                              │
│  Timezone:          Europe/London (UTC+0)                     │
│  CPU cores:         10                                        │
│  RAM:               16 GB                                     │
│  GPU:               Apple M1 Pro (via WebGL)                  │
│  Touch:             Not supported (desktop)                   │
│  Do Not Track:      Enabled                                  │
│                                                              │
│  ─── Your fingerprint uniqueness ───                         │
│  Based on these signals, your browser configuration is       │
│  shared by approximately 1 in 48,000 visitors.               │
│  [Learn more about browser fingerprinting →]                 │
│                                                              │
│  ─── What we store ───                                       │
│  We store: IP address, timestamp, file size                  │
│  We do NOT store: fingerprint data, location, browser details│
│  Fingerprint is shown to you for transparency only.          │
└──────────────────────────────────────────────────────────────┘
```

### 6.4 Local Storage Transparency

Similarly, show users what we store in their browser's localStorage:

```
┌──────────────────────────────────────────────────────────────┐
│  🗄 What we store in your browser                             │
│                                                              │
│  Key                        Value              Purpose       │
│  ss_visitor_id              vis_a3f9c2...      Anonymous ID  │
│  ss_uploads_count           7                  Usage stat    │
│  ss_total_uploaded_bytes    34,821,033         Usage stat    │
│  ss_last_visit              2026-02-08T14:32Z  Convenience   │
│  ss_theme_preference        dark               UI preference │
│                                                              │
│  [Clear all stored data]                                     │
│                                                              │
│  This data never leaves your browser. We cannot see it.      │
└──────────────────────────────────────────────────────────────┘
```

### 6.5 Issues FS Tree

```
STORY: Fingerprint — server-side IP enrichment
├── TASK: Integrate IP data service (ipdata.co or similar)
├── TASK: Retrieve geo, ISP, VPN status, threat score per request
├── TASK: Include IP enrichment in transparency panel
└── TEST: Functional — geo + threat data displayed correctly

STORY: Fingerprint — client-side browser signals
├── TASK: Collect passive browser signals (screen, language, timezone, etc.)
├── TASK: Collect hardware signals (cores, memory, GPU via WebGL)
├── TASK: Compute fingerprint hash + estimated uniqueness
├── TASK: Build fingerprint transparency UI component
└── TEST: Functional — all signals collected and displayed

STORY: Fingerprint — localStorage transparency
├── TASK: Define what we store in localStorage (visitor ID, usage stats)
├── TASK: Build localStorage transparency panel
├── TASK: Add "Clear all stored data" button
└── TEST: Functional — panel reflects actual localStorage contents

STORY: Fingerprint — privacy education page
├── TASK: Write "How fingerprinting works" explainer
├── TASK: Link from transparency panel to education page
└── TEST: Content review — clear, not alarmist
```

---

## 7. Workstream: Security Intelligence & IDS

### 7.1 Vision

Build a lightweight intrusion detection system that monitors access patterns, enriches IP data, detects anomalies, and surfaces threats — both to the operator (admin dashboard) and to the user (transparency panel).

### 7.2 Capabilities

| Capability | Description | Data Source |
|-----------|-------------|------------|
| **IP reputation** | Score each visitor's IP against threat databases | ipdata.co, AbuseIPDB |
| **Geo anomaly** | Flag when same token is used from geographically distant IPs in short time | Request logs |
| **Rate anomaly** | Flag unusual upload/download frequency | Request logs |
| **Known-bad UA** | Flag requests from known bot/scanner user-agents | UA string matching |
| **Token abuse** | Flag tokens with anomalous usage patterns | Transfer metadata |
| **Access timeline** | Visual timeline of all access events per transfer | events.json |

### 7.3 Threat Data Model

Per-request enrichment stored in `events.json`:

```json
{
  "type": "download",
  "timestamp": "2026-02-08T16:45:00Z",
  "ip": "198.51.100.7",
  "user_agent": "Mozilla/5.0 ...",
  "enrichment": {
    "geo": { "city": "London", "country": "GB", "lat": 51.5, "lon": -0.1 },
    "isp": "BT", "asn": 2856,
    "is_vpn": false, "is_proxy": false, "is_tor": false,
    "threat_score": 0.12,
    "threat_level": "low"
  }
}
```

### 7.4 Issues FS Tree

```
STORY: IDS — IP reputation integration
├── TASK: Integrate ipdata.co (or AbuseIPDB) API
├── TASK: Cache IP lookups (same IP within 24h → use cached)
├── TASK: Store enrichment in events.json
├── TASK: Surface threat level in admin dashboard
└── TEST: Functional — IP enrichment data present in events

STORY: IDS — anomaly detection rules
├── TASK: Geo distance anomaly (same token, >1000km in <1hr)
├── TASK: Rate anomaly (>N transfers per token per hour)
├── TASK: Known-bad UA detection (scanner signatures)
├── TASK: Alert mechanism (flag in admin dashboard, optional email)
└── TEST: Functional — anomaly triggers alert

STORY: IDS — access timeline visualisation
├── TASK: Build per-transfer timeline view (who accessed, when, from where)
├── TASK: Map view showing download geolocations
└── TEST: Functional — timeline renders with enrichment data
```

---

## 8. Workstream: Bot & Abuse Detection

### 8.1 Vision

Distinguish between real human users, automated bots, and agentic AI users. Prevent abuse (scraping, token stuffing, bandwidth theft) while remaining transparent about how detection works.

### 8.2 Detection Signals

| Signal | Human | Bot | Agentic AI |
|--------|-------|-----|-----------|
| JavaScript execution | Yes | Usually no | Varies (headless browsers) |
| Mouse/touch events | Yes | No | No |
| Timing patterns | Variable | Uniform | Variable but fast |
| Canvas fingerprint | Unique | Missing or generic | Generic |
| WebGL renderer | Hardware GPU | Often missing | Software renderer |
| Navigator automation flags | `false` | Often `true` | Often `true` |
| Request cadence | Irregular | Regular intervals | Burst patterns |

### 8.3 Response Tiers

| Classification | Response | Transparency |
|---------------|----------|-------------|
| **Human** | Full access | Show fingerprint panel normally |
| **Likely bot** | CAPTCHA challenge or soft block | "We think you might be automated" |
| **Confirmed bot** | Hard block (429) | Clear error message |
| **Agentic AI** | Rate-limited, flagged | "We detected automation" |
| **Abuse** (token stuffing, etc.) | Token revocation | Admin notification |

### 8.4 Issues FS Tree

```
STORY: Bot Detection — client-side signals
├── TASK: Collect automation indicators (webdriver, phantom, etc.)
├── TASK: Collect interaction signals (mouse movement, typing cadence)
├── TASK: Compute human-likelihood score
└── TEST: Functional — score differs for real browser vs curl vs Puppeteer

STORY: Bot Detection — server-side analysis
├── TASK: Analyse request patterns per IP and per token
├── TASK: Flag uniform timing intervals
├── TASK: Implement rate limiting (per IP, per token)
└── TEST: Functional — rapid-fire requests get throttled

STORY: Bot Detection — response actions
├── TASK: Implement CAPTCHA challenge (fallback, not default)
├── TASK: Implement soft block (warning) and hard block (429)
├── TASK: Add bot classification to admin dashboard
├── TASK: Add bot alert to operator notifications
└── TEST: E2E — bot-like request pattern triggers appropriate response
```

---

## 9. Consolidated Roadmap

```
Phase 0 (NOW)     ── MVP ──────────────────────────────────────────
                   Ship core transfer flow, token auth, transparency
                   panel, three environments (dev/qa/prod)

Phase 1 (MVP+2w)  ── Deploy-Everywhere ────────────────────────────
                   Storage abstraction → local FS backend
                   PyPI package → Docker image → Docker Hub
                   Basic cost tagging on AWS resources

Phase 2 (MVP+4w)  ── Cost Tracking + Billing Foundation ───────────
                   Per-transfer cost model
                   AWS Cost Explorer integration
                   Stripe credit purchase flow
                   Credit deduction on transfer

Phase 3 (MVP+6w)  ── Fingerprint Transparency ─────────────────────
                   IP enrichment (ipdata.co)
                   Browser fingerprint collection + display
                   localStorage transparency panel
                   Privacy education page

Phase 4 (MVP+8w)  ── Security Intelligence ────────────────────────
                   IDS rules (geo anomaly, rate anomaly, bad UA)
                   Access timeline with map
                   Threat level surfacing (to user + admin)

Phase 5 (MVP+10w) ── Bot Detection + Hardening ────────────────────
                   Client-side + server-side bot signals
                   Rate limiting + CAPTCHA
                   Agentic AI detection
                   AWS Marketplace AMI listing

Phase 6 (MVP+12w) ── Enterprise Features ──────────────────────────
                   Self-hosted deployment guide
                   CloudFormation + Terraform modules
                   Custom branding / white-label
                   SSO / SAML integration
```

---

## 10. Full Issues FS Epic Tree

```
EPIC: Secure Send — Post-MVP Roadmap
│
├── EPIC: Deploy-Everywhere
│   ├── STORY: Storage abstraction layer
│   ├── STORY: PyPI distribution
│   ├── STORY: Docker distribution
│   ├── STORY: AWS Marketplace AMI
│   ├── STORY: CloudFormation / Terraform templates
│   └── STORY: ECS/Fargate container deployment
│
├── EPIC: Cost Tracking & Transparency
│   ├── STORY: Per-transfer cost model
│   ├── STORY: AWS resource tagging
│   ├── STORY: Operator cost dashboard
│   └── STORY: Cost-per-token breakdown
│
├── EPIC: Billing & Credits
│   ├── STORY: Credit purchase flow (Stripe)
│   ├── STORY: Credit deduction on transfer
│   ├── STORY: Credit balance dashboard
│   └── SPIKE: Pricing model validation (what will users pay?)
│
├── EPIC: Browser Fingerprint Transparency
│   ├── STORY: Server-side IP enrichment
│   ├── STORY: Client-side browser signals
│   ├── STORY: localStorage transparency
│   └── STORY: Privacy education page
│
├── EPIC: Security Intelligence & IDS
│   ├── STORY: IP reputation integration
│   ├── STORY: Anomaly detection rules
│   ├── STORY: Access timeline visualisation
│   └── STORY: Operator threat dashboard
│
└── EPIC: Bot & Abuse Detection
    ├── STORY: Client-side bot signals
    ├── STORY: Server-side pattern analysis
    ├── STORY: Response actions (rate limit, CAPTCHA, block)
    └── STORY: Agentic AI detection
```

---

## 11. Cross-Cutting Concerns

### 11.1 Separate AWS Account

All Secure Send infrastructure MUST run in a dedicated AWS account (not shared with other MGraph services). This provides:

- **Cost isolation** — 100% of costs in this account = Secure Send
- **Blast radius containment** — compromise here doesn't affect other services
- **Clean billing** — no tag-based cost allocation guesswork
- **Compliance** — GDPR data processing scope is per-account

### 11.2 Tagging Strategy

Every AWS resource gets these tags:

```
project:      secure-send
tier:         dev | qa | prod
workstream:   core | deploy | billing | fingerprint | ids | bot
cost-centre:  secure-send-ops
managed-by:   mgraph | terraform | manual
```

### 11.3 Cost Per Request (Target Metrics)

The operator should be able to answer these questions at any time:

| Question | Data Source |
|----------|-----------|
| What does a single transfer cost me? | `cost.json` per transfer |
| What's my average cost per MB transferred? | Aggregate across all transfers |
| Which tokens cost the most? | Cost grouped by `token_id` |
| What's my monthly infrastructure burn rate? | AWS Cost Explorer |
| What's my revenue vs cost margin? | Billing credits consumed vs infra costs |
| Is the pricing model sustainable? | Margin analysis over time |

---

*All items in this document should be instantiated as Issues FS issues by the Conductor, linked as children of the main Secure Send epic. Phase 0 (MVP) items from the main brief take priority. Post-MVP workstreams begin only after MVP is shipped and usable.*
