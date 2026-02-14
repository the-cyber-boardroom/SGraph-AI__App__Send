# Secure Send — Project Brief

**Version:** 1.0 DRAFT  
**Date:** February 2026  
**Stack:** M-Graph (FastAPI/Lambda) · AWS S3 (pre-signed URLs) · Issues FS · Claude Teams Multi-Agent  

---

## 1. Executive Summary

This project delivers a **privacy-first, zero-knowledge file sharing service** (codename **"Secure Send"**) inspired by WeTransfer and Send.it, but fundamentally different in three ways: **no ads**, **no tracking**, and **end-to-end encryption** where the server never has access to plaintext file content.

The core innovation is a simple but powerful design choice: files are encrypted on the client before upload, and the decryption key is never sent to the server. This means even a complete server compromise, S3 data leak, or URL exposure is harmless — the encrypted blob is useless without the separately-shared decryption key. This single architectural decision eliminates ~90% of the security risk surface.

The MVP is invitation-only, gated by pre-distributed access tokens. No accounts, no passwords, no sign-up flow. The service will be built on AWS serverless infrastructure using the **M-Graph framework** (FastAPI on Lambda) with direct S3 uploads/downloads via pre-signed URLs. All project management, task tracking, and sign-off will be orchestrated through **Issues FS**. Development will be executed by a **multi-agent Claude Teams** setup.

---

## 2. Background & Motivation

Existing file-sharing services (WeTransfer, SendAnywhere, etc.) suffer from several fundamental problems:

- **Ad-saturated UIs** — distracting, unprofessional, and tracking-heavy
- **Server-side access to plaintext data** — the service provider can read your files
- **Opaque data practices** — users have no visibility into what's being captured about them
- **Privacy theatre** — claims of security without true zero-knowledge architecture

Secure Send takes the opposite approach: radical transparency about what's captured (IP address, timestamps, file size) combined with genuine zero-knowledge for file content. The service will initially be used by friends and family, with a future billing model once validated.

---

## 3. User Stories

### 3.1 Platform Admin (Operator)

| ID | Story | Priority | Points |
|----|-------|----------|--------|
| ADM-1 | As the operator, I want to generate and distribute access tokens so I can control who uses the service during the beta. | Must | 5 |
| ADM-2 | As the operator, I want to see usage analytics — number of active tokens, total transfers, aggregate file sizes, transfer counts — without seeing any file content. | Must | 5 |
| ADM-3 | As the operator, I want to revoke tokens so I can cut off access for specific users if needed. | Should | 3 |
| ADM-4 | As the operator, I want a "register interest" / mailing list sign-up page so potential users can express interest in getting a token. | Should | 3 |
| ADM-5 | As the operator, I want to set file size limits and expiry policies per token or globally. | Could | 3 |

### 3.2 Sender (File Uploader)

| ID | Story | Priority | Points |
|----|-------|----------|--------|
| SND-1 | As a sender, I want to drag-and-drop (or browse) a file onto the page and have it encrypted and uploaded seamlessly. | Must | 8 |
| SND-2 | As a sender, after upload I want to receive two pieces of information: a **download link** (URL) and a **decryption key**, clearly presented for me to copy and share. | Must | 5 |
| SND-3 | As a sender, I want to be told explicitly to share the link and the key via **separate channels** (e.g. link via email, key via WhatsApp) for maximum security. | Should | 2 |
| SND-4 | As a sender, I want to see a transparency panel showing exactly what the server has captured about me: my IP address, upload timestamp, file size, and nothing else. | Must | 5 |
| SND-5 | As a sender, I want to see a live status page for my transfer — whether the file has been downloaded, how many times, and when. | Must | 5 |
| SND-6 | As a sender, I want to enter my access token to authenticate before I can upload. | Must | 3 |
| SND-7 | As a sender, I want to share text/secrets (not just files) — a simple text input mode as an alternative to file upload. | Should | 3 |

### 3.3 Receiver (File Downloader)

| ID | Story | Priority | Points |
|----|-------|----------|--------|
| RCV-1 | As a receiver, I want to open the download link, enter the decryption key, and receive the decrypted file — all in the browser with no install required. | Must | 8 |
| RCV-2 | As a receiver, I want to see a transparency panel showing exactly what the server captures about my download: my IP address, download timestamp, and browser user-agent. | Must | 3 |
| RCV-3 | As a receiver, I want the page to clearly explain what Secure Send is and how the encryption works, so I trust the process. | Should | 2 |
| RCV-4 | As a receiver, I should NOT need an access token — the download link is sufficient for retrieval (the token gates upload, not download). | Must | 2 |
| RCV-5 | As a receiver, if I enter the wrong decryption key, I want a clear error message (not a corrupted file download). | Must | 3 |

### 3.4 Security & Privacy

| ID | Story | Priority | Points |
|----|-------|----------|--------|
| SEC-1 | All file content must be encrypted client-side before upload. The server must never possess the decryption key or access plaintext file content. | Must | 8 |
| SEC-2 | The encryption key is generated on the client and never transmitted to the server. Only the user sees it. | Must | 5 |
| SEC-3 | The download URL alone is useless — decryption requires the separately-shared key. | Must | 5 |
| SEC-4 | Data at rest in S3 must be additionally encrypted (SSE-S3 or SSE-KMS) as defence-in-depth. | Must | 2 |
| SEC-5 | The server must validate that uploaded content is a binary blob (ciphertext), not raw plaintext, as a safety check. | Should | 3 |
| SEC-6 | All metadata captured about users (IP, timestamps, user-agent, file size) must be displayed to the user on the page before and after their action. | Must | 3 |
| SEC-7 | Access tokens must be validated server-side on every upload request. Invalid or revoked tokens must be rejected. | Must | 3 |

---

## 4. Architecture

### 4.1 High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                       FRONTEND (Static)                              │
│  Upload Page · Download Page · Admin Dashboard · Client-side Crypto  │
│  Transparency Panel · Register Interest Page                         │
│            Hosted: S3 + CloudFront (or Lambda@Edge)                  │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────────────────┐
│                 API GATEWAY + LAMBDA (M-Graph)                       │
│                      FastAPI on Lambda                                │
│                                                                      │
│  POST /transfers              – initiate transfer (get pre-signed    │
│                                  upload URL + transfer ID)           │
│  POST /transfers/{id}/complete – mark upload as complete             │
│  GET  /transfers/{id}         – get transfer metadata + stats        │
│  GET  /transfers/{id}/download – get pre-signed download URL         │
│  POST /transfers/{id}/event   – log download event (timestamp, IP)   │
│                                                                      │
│  POST /tokens                 – create access token (admin)          │
│  GET  /tokens                 – list tokens + usage (admin)          │
│  DELETE /tokens/{id}          – revoke token (admin)                 │
│                                                                      │
│  GET  /admin/stats            – aggregate usage analytics            │
│  POST /register-interest      – mailing list sign-up                 │
│  GET  /health                 – health check                         │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────────┐
│                        AWS STORAGE (S3)                               │
│                                                                      │
│  Bucket: secure-send-{tier}-{region}-data                            │
│    transfers/{transfer_id}/                                          │
│    ├── meta.json           (file size, upload timestamp, sender IP,  │
│    │                        content-type hint, expiry, status)       │
│    ├── events.json         (download events: timestamp, IP, UA,      │
│    │                        success/failure)                         │
│    └── payload.enc         (encrypted binary blob — opaque to server)│
│                                                                      │
│  Bucket: secure-send-{tier}-{region}-config                          │
│    tokens/{token_id}.json  (token metadata, usage count, status)     │
│    waitlist/               (register-interest submissions)           │
│    admin/stats.json        (aggregate stats, updated on each event)  │
│                                                                      │
│  ⚠ payload.enc is uploaded/downloaded directly via pre-signed URLs   │
│    — Lambda never touches the file content.                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Transfer Flow (Critical Path)

```
SENDER                          SERVER (Lambda)                    S3
  │                                 │                               │
  ├─ POST /transfers ──────────────►│                               │
  │  { token, file_size,            │── validate token             │
  │    content_type_hint }          │── create meta.json ─────────►│
  │                                 │── generate pre-signed PUT ──►│
  │◄─ { transfer_id,               │                               │
  │     upload_url (pre-signed),    │                               │
  │     expires_in }                │                               │
  │                                 │                               │
  │  [Client generates AES-256-GCM key]                             │
  │  [Client encrypts file → ciphertext blob]                       │
  │                                 │                               │
  ├─ PUT upload_url ───────────────────────────────────────────────►│
  │  (direct S3 upload, binary blob)                                │
  │◄─ 200 OK ◄────────────────────────────────────────────────────│
  │                                 │                               │
  ├─ POST /transfers/{id}/complete ►│                               │
  │                                 │── update meta.json status ──►│
  │◄─ { download_link,             │                               │
  │     transparency: {             │                               │
  │       ip: "203.0.113.42",       │                               │
  │       timestamp: "...",         │                               │
  │       file_size: 4821033,       │                               │
  │       stored_fields: [...]      │                               │
  │     }                           │                               │
  │   }                             │                               │
  │                                 │                               │
  │  [Client displays:              │                               │
  │   - Download link (copy button) │                               │
  │   - Decryption key (copy button)│                               │
  │   - Transparency panel          │                               │
  │   - "Share via separate channels" guidance]                     │


RECEIVER                        SERVER (Lambda)                    S3
  │                                 │                               │
  ├─ GET /transfers/{id} ──────────►│                               │
  │                                 │── read meta.json ◄───────────│
  │◄─ { status, file_size,         │                               │
  │     created_at,                 │                               │
  │     download_count }            │                               │
  │                                 │                               │
  │  [Receiver enters decryption key in UI]                         │
  │                                 │                               │
  ├─ GET /transfers/{id}/download ─►│                               │
  │                                 │── log event (IP, UA, ts) ───►│
  │                                 │── generate pre-signed GET ──►│
  │◄─ { download_url (pre-signed), │                               │
  │     transparency: {             │                               │
  │       ip: "198.51.100.7",       │                               │
  │       timestamp: "...",         │                               │
  │       user_agent: "...",        │                               │
  │       stored_fields: [...]      │                               │
  │     }                           │                               │
  │   }                             │                               │
  │                                 │                               │
  ├─ GET download_url ─────────────────────────────────────────────►│
  │  (direct S3 download, encrypted blob)                           │
  │◄─ encrypted payload ◄─────────────────────────────────────────│
  │                                 │                               │
  │  [Client decrypts blob using key entered in UI]                 │
  │  [Client triggers browser "Save As" with decrypted file]        │
  │                                 │                               │
  │  [Both sender's and receiver's pages now show updated stats]    │
```

### 4.3 M-Graph Framework

The backend is deployed using M-Graph — a custom serverless framework that simplifies deploying FastAPI apps to AWS Lambda. Key characteristics:

- FastAPI application with standard route definitions
- Automatic packaging and deployment to Lambda behind API Gateway
- Mangum adapter for Lambda ↔ ASGI bridging
- Infrastructure-as-code configuration for easy environment promotion
- Three deployment environments: **dev → qa → prod**

### 4.4 Encryption Model

The encryption scheme ensures **zero-knowledge on the server side**:

1. **Key generation:** Client generates an AES-256-GCM symmetric key (via Web Crypto API). This key never leaves the browser.
2. **Encryption:** Client encrypts the file (or text) using AES-256-GCM, producing a ciphertext blob + IV + auth tag, bundled into `payload.enc`.
3. **Upload:** The ciphertext blob is uploaded directly to S3 via pre-signed PUT URL. Lambda never sees the file content.
4. **Key sharing:** The client displays the base64-encoded key for the user to copy and share separately from the download link.
5. **Download:** Receiver fetches the ciphertext blob directly from S3 via pre-signed GET URL. Client decrypts using the entered key.

**Why symmetric (AES-GCM) and not asymmetric (RSA)?** For file sharing, the sender and receiver share a secret (the key). There's no need for public/private keypair semantics — unlike the Pilates Scheduler where voters encrypt TO the organiser. Here, whoever has the key can decrypt. AES-GCM is also faster for large files and has no size limitations.

**Key format for sharing:**

```
Key: a3Bf9xK2mP7qR4sT8vW1yZ... (base64url, 44 chars for 256-bit)
```

Short enough to paste into a message, long enough to be cryptographically secure.

### 4.5 Pre-Signed URL Strategy

Lambda cannot handle large file transfers (6MB API Gateway payload limit, 15-minute Lambda timeout). Instead:

| Operation | Method | URL | Expiry |
|-----------|--------|-----|--------|
| Upload | `PUT` pre-signed URL | `s3://.../{transfer_id}/payload.enc` | 1 hour |
| Download | `GET` pre-signed URL | `s3://.../{transfer_id}/payload.enc` | 1 hour |

The Lambda function orchestrates (auth, metadata, logging) but never touches file bytes.

### 4.6 Transparency Model

A core feature — not just a privacy policy page, but real-time visibility built into the UI:

**On upload completion, the sender sees:**
```
┌──────────────────────────────────────────────┐
│  🔍 What we stored about this transfer       │
│                                              │
│  Your IP address:      203.0.113.42          │
│  Upload time:          2026-02-08 14:32 UTC  │
│  File size:            4.8 MB                │
│  File name:            ❌ NOT stored          │
│  File content:         ❌ Encrypted (we       │
│                           cannot read it)     │
│  Decryption key:       ❌ NOT stored          │
│                           (only you have it)  │
│                                              │
│  That's it. Nothing else.                    │
└──────────────────────────────────────────────┘
```

**On download, the receiver sees a similar panel** with their IP, download timestamp, and user-agent string.

**The sender's status page updates** to show download events (without revealing the receiver's decryption success — we can only confirm the blob was fetched, not that decryption succeeded).

### 4.7 Data Storage

All data lives in S3 (aligning with the "S3 as my database" pattern):

```
transfers/{transfer_id}/
├── meta.json
│   {
│     "transfer_id": "abc123",
│     "status": "completed",           // pending → completed → expired
│     "created_at": "2026-02-08T14:32:00Z",
│     "sender_ip": "203.0.113.42",
│     "file_size_bytes": 4821033,
│     "content_type_hint": "application/pdf",
│     "token_id": "tok_xyz",
│     "expires_at": "2026-02-15T14:32:00Z"   // 7-day default
│   }
│
├── events.json
│   {
│     "events": [
│       {
│         "type": "upload_complete",
│         "timestamp": "2026-02-08T14:33:12Z",
│         "ip": "203.0.113.42"
│       },
│       {
│         "type": "download",
│         "timestamp": "2026-02-08T16:45:00Z",
│         "ip": "198.51.100.7",
│         "user_agent": "Mozilla/5.0 ..."
│       }
│     ]
│   }
│
└── payload.enc            (opaque encrypted blob — binary)
```

### 4.8 Environments

| Environment | Purpose | URL Pattern |
|-------------|---------|-------------|
| **dev** | Active development, unstable | `dev-send.{domain}` |
| **qa** | Integration testing, pre-release validation | `qa-send.{domain}` |
| **prod** | Live, shared with beta users | `send.{domain}` |

All three environments are independently deployable via M-Graph config.

---

## 5. Multi-Agent Setup (Claude Teams)

### 5.1 Agent Roles

| Agent | Responsibilities | Key Artefacts |
|-------|-----------------|---------------|
| **Conductor** | Orchestrates the overall workflow. Breaks the brief into Issues FS issues, assigns work to agents, monitors progress, resolves blockers, performs final sign-off. | Issues FS issue tree, status reports, go/no-go decisions |
| **Architect** | Defines system design, API contracts, data models, encryption scheme, pre-signed URL flow, S3 layout, infrastructure config. Reviews PRs for architectural compliance. | Architecture decision records, OpenAPI spec, data model schemas, M-Graph config |
| **Developer** | Implements backend (FastAPI/Lambda), frontend (static HTML/JS/Web Crypto), pre-signed URL flow, transparency panel, admin dashboard. Writes code against the issues assigned by Conductor. | Source code, deployment scripts, M-Graph app config |
| **QA** | Writes and executes test plans, integration tests, E2E tests. Validates security requirements (encryption, no plaintext on server, pre-signed URL flow). Validates across all three environments. | Test plans, test scripts, bug reports (as Issues FS issues), test results |
| **Documentarian** | Writes user-facing copy (transparency explanations, how-it-works page, token distribution instructions), API documentation, and operator runbooks. | User guides, API docs, operational documentation |

### 5.2 Orchestration Flow

```
Conductor
  │
  ├─► Creates Issues FS epic + stories from this brief
  ├─► Assigns architecture tasks → Architect
  │     └─► Architect produces: API spec, data model, crypto scheme,
  │         pre-signed URL flow, S3 layout
  │         └─► Conductor reviews & approves
  │
  ├─► Assigns implementation → Developer
  │     ├─► Backend: Lambda endpoints, S3 operations, token validation
  │     ├─► Frontend: Upload page, download page, admin dashboard,
  │     │   transparency panel, Web Crypto integration
  │     └─► Each task transitions through: backlog → in-progress → in-review → done
  │
  ├─► Assigns documentation → Documentarian
  │     └─► User-facing copy, API docs, operational runbook
  │
  ├─► Assigns testing → QA
  │     ├─► Test plans from user stories
  │     ├─► Security audit: verify no plaintext in S3, verify pre-signed URL scoping
  │     ├─► E2E tests: upload → share → download → decrypt
  │     │     └─► Files bugs as Issues FS issues → Developer fixes
  │     └─► Environment promotion testing: dev → qa → prod
  │
  └─► Final sign-off checklist via Issues FS
```

### 5.3 Coordination via Issues FS

All task definition, tracking, and sign-off uses **Issues FS** (the organiser's file-system-based issue tracker with CLI). The entire project should be representable as an Issues FS issue tree.

**Issue Types:**

| Type | Purpose | Example |
|------|---------|---------|
| **Epic** | Top-level project container | `EPIC: Secure Send MVP` |
| **Story** | User story from Section 3 | `STORY: SND-1 — Drag-and-drop file upload with client-side encryption` |
| **Task** | Technical implementation unit | `TASK: Implement POST /transfers endpoint with pre-signed URL generation` |
| **Bug** | Defect found during QA | `BUG: Decryption fails silently on wrong key (should show error)` |
| **Spike** | Research / proof-of-concept | `SPIKE: Test Web Crypto AES-256-GCM file encryption at 100MB+` |
| **Test** | Test plan / test execution record | `TEST: E2E — full transfer flow (upload → share → download → decrypt)` |
| **Deploy** | Deployment verification | `DEPLOY: Promote qa → prod` |

**Issue Links:**
- `blocks / blocked-by` — dependency tracking between tasks
- `parent / child` — story → task decomposition
- `tests / tested-by` — linking test issues to implementation tasks
- `duplicates / duplicated-by` — for dedup

**Workflow States:**
`backlog → in-progress → in-review → done → verified`

---

## 6. UI Wireframes (Conceptual)

### 6.1 Upload Page

```
┌─────────────────────────────────────────────────────────┐
│  SECURE SEND                              [How it works] │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Access Token: [________________________] [Verify] │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  │
│  │                                                    │  │
│  │        📁  Drop your file here                    │  │
│  │            or click to browse                      │  │
│  │                                                    │  │
│  │        Max size: 100MB · Encrypted in browser      │  │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │
│                                                          │
│  ── OR share a secret text ──                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │  [Enter text, password, or secret to share...]     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│              [ 🔒 Encrypt & Upload ]                     │
└─────────────────────────────────────────────────────────┘
```

### 6.2 Upload Complete / Status Page

```
┌─────────────────────────────────────────────────────────┐
│  SECURE SEND                                             │
│                                                          │
│  ✅ Your file has been encrypted and uploaded.            │
│                                                          │
│  ┌── Share these TWO items separately ──────────────┐   │
│  │                                                    │   │
│  │  📎 Download link:                                │   │
│  │  https://send.example.com/d/abc123    [📋 Copy]   │   │
│  │                                                    │   │
│  │  🔑 Decryption key:                               │   │
│  │  a3Bf9xK2mP7qR4sT8vW1yZ0...          [📋 Copy]   │   │
│  │                                                    │   │
│  │  ⚠ For best security, send the link and the key   │   │
│  │    via DIFFERENT channels (e.g. email + WhatsApp). │   │
│  └────────────────────────────────────────────────────┘   │
│                                                          │
│  ─── Transfer Status ───                                 │
│  Created: 2026-02-08 14:32 UTC                           │
│  File size: 4.8 MB                                       │
│  Downloads: 0                                            │
│  Expires: 2026-02-15 14:32 UTC                           │
│                                                          │
│  ─── 🔍 What we stored (transparency) ───               │
│  Your IP:       203.0.113.42                             │
│  Upload time:   2026-02-08 14:32 UTC                     │
│  File size:     4.8 MB                                   │
│  File name:     ❌ NOT stored                             │
│  File content:  ❌ Encrypted (we cannot read it)          │
│  Decrypt key:   ❌ NOT stored (only you have it)          │
│                                                          │
│  That's everything. Nothing else is captured.            │
└─────────────────────────────────────────────────────────┘
```

### 6.3 Download Page

```
┌─────────────────────────────────────────────────────────┐
│  SECURE SEND                              [How it works] │
│                                                          │
│  📦 Someone sent you an encrypted file.                  │
│                                                          │
│  File size: 4.8 MB                                       │
│  Uploaded: 2026-02-08 14:32 UTC                          │
│  Expires: 2026-02-15 14:32 UTC                           │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  🔑 Enter decryption key:                          │  │
│  │  [________________________________________]        │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│              [ 🔓 Download & Decrypt ]                   │
│                                                          │
│  ─── 🔍 What we capture about this download ───         │
│  Your IP:       198.51.100.7                             │
│  Browser:       Chrome 121 on macOS                      │
│  This info will be visible to the sender.                │
│                                                          │
│  [How it works: Your file is downloaded encrypted,       │
│   then decrypted entirely in your browser. We never      │
│   see the contents or the key.]                          │
└─────────────────────────────────────────────────────────┘
```

---

## 7. API Specification

### 7.1 Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/transfers` | Token | Initiate a transfer; returns transfer ID + pre-signed upload URL |
| `POST` | `/transfers/{id}/complete` | Token | Mark upload as complete; returns download link + transparency data |
| `GET` | `/transfers/{id}` | None | Get transfer metadata + download count (public) |
| `GET` | `/transfers/{id}/download` | None | Log download event; returns pre-signed download URL |
| `POST` | `/transfers/{id}/event` | None | Record client-side event (e.g. decryption failure) |
| `POST` | `/tokens` | Admin | Create new access token |
| `GET` | `/tokens` | Admin | List tokens with usage stats |
| `DELETE` | `/tokens/{id}` | Admin | Revoke a token |
| `GET` | `/admin/stats` | Admin | Aggregate usage analytics |
| `POST` | `/register-interest` | None | Mailing list sign-up |
| `GET` | `/health` | None | Health check |

### 7.2 Authentication Model

| Role | Mechanism | Details |
|------|-----------|---------|
| **Sender** | `Authorization: Bearer tok_abc123` | Pre-distributed token, validated on `/transfers` and `/transfers/{id}/complete` |
| **Receiver** | None | Download link is publicly accessible (content is encrypted, so this is safe) |
| **Admin** | `Authorization: Bearer adm_xyz789` | Admin key, hard-coded or via environment variable for MVP |

### 7.3 Key API Payloads

**POST /transfers (request):**
```json
{
  "file_size_bytes": 4821033,
  "content_type_hint": "application/pdf"
}
```

**POST /transfers (response):**
```json
{
  "transfer_id": "abc123",
  "upload_url": "https://s3.eu-west-1.amazonaws.com/...?X-Amz-Signature=...",
  "upload_expires_in": 3600,
  "transfer_url": "https://send.example.com/d/abc123"
}
```

**POST /transfers/{id}/complete (response):**
```json
{
  "download_link": "https://send.example.com/d/abc123",
  "transparency": {
    "your_ip": "203.0.113.42",
    "upload_timestamp": "2026-02-08T14:32:00Z",
    "file_size_bytes": 4821033,
    "stored_fields": ["ip", "timestamp", "file_size", "token_id"],
    "not_stored": ["file_name", "file_content", "decryption_key"]
  }
}
```

---

## 8. Deployment Architecture

### 8.1 Infrastructure (per environment)

```
CloudFront
  ├── Default: S3 frontend bucket (static site)
  └── /api/*: API Gateway → Lambda (M-Graph/FastAPI)

S3: secure-send-{tier}-{region}-data     (transfers + encrypted payloads)
S3: secure-send-{tier}-{region}-frontend (static site)
S3: secure-send-{tier}-{region}-config   (tokens, waitlist, stats)

Lambda: secure-send-{tier}-api
  Runtime: Python 3.12 (arm64)
  Memory: 256MB
  Timeout: 30s
  Reserved concurrency: 10

IAM: secure-send-{tier}-lambda-exec
  (S3 read/write scoped to data + config buckets, CloudWatch logs)

IAM: secure-send-{tier}-deployer
  (Lambda update, S3 frontend sync, CloudFront invalidation)
```

### 8.2 Deployment Verification Checklist

| # | Check | Verified By |
|---|-------|-------------|
| 1 | Lambda responds to `/health` | Smoke test |
| 2 | Pre-signed upload URL works (PUT to S3 succeeds) | E2E test |
| 3 | Pre-signed download URL works (GET from S3 succeeds) | E2E test |
| 4 | Token validation rejects invalid tokens | Functional test |
| 5 | S3 bucket has no public access (except via pre-signed URLs) | Security test |
| 6 | No plaintext file content visible in S3 objects or CloudWatch logs | Security audit |
| 7 | CORS configured correctly for frontend origin | Functional test |
| 8 | Frontend loads and renders on mobile browsers | Device test |
| 9 | CloudFront serves frontend with correct cache headers | Functional test |
| 10 | Transparency panel displays correct IP address | E2E test |

---

## 9. Success Criteria & Acceptance

| # | Criterion | Verified By |
|---|-----------|-------------|
| 1 | Sender can upload a file (drag-and-drop), get download link + decryption key | QA — E2E test |
| 2 | Receiver can enter key, download, and decrypt the original file intact | QA — E2E test |
| 3 | File content is encrypted client-side; S3 never contains plaintext | QA — security audit |
| 4 | Wrong decryption key produces a clear error, not a corrupted download | QA — E2E test |
| 5 | Sender's status page shows download events in real time | QA — functional test |
| 6 | Transparency panel accurately shows captured metadata on both upload and download pages | QA — functional test |
| 7 | Token validation gates uploads; invalid tokens are rejected | QA — functional test |
| 8 | Admin dashboard shows aggregate usage stats | QA — functional test |
| 9 | Works on mobile browsers (Safari, Chrome) | QA — device test |
| 10 | All three environments (dev, qa, prod) deploy and function independently | QA — deploy verification |
| 11 | All Issues FS issues are in `verified` state | Conductor — sign-off |
| 12 | User-facing documentation (how-it-works, transparency explanation) is present | QA — content review |

---

## 10. Issues FS — Full Project Structure

Below is the recommended issue tree for the Conductor to instantiate in Issues FS at project kick-off:

```
EPIC: Secure Send MVP
│
├── SPIKE: Web Crypto AES-256-GCM file encryption (browser compat, max size, performance)
├── SPIKE: S3 pre-signed URL flow (PUT upload, GET download, CORS, expiry)
│
├── STORY: ADM-1 — Generate and distribute access tokens
│   ├── TASK: Design token data model (tokens/{token_id}.json schema)
│   ├── TASK: Implement POST /tokens endpoint
│   ├── TASK: Implement GET /tokens endpoint
│   ├── TASK: Implement DELETE /tokens/{id} endpoint
│   ├── TASK: Build admin token management UI
│   └── TEST: E2E — create, list, revoke token flow
│
├── STORY: ADM-2 — Usage analytics dashboard
│   ├── TASK: Design aggregate stats data model
│   ├── TASK: Implement GET /admin/stats endpoint
│   ├── TASK: Build admin stats dashboard UI
│   └── TEST: Functional — stats update after transfers
│
├── STORY: ADM-4 — Register interest / mailing list
│   ├── TASK: Implement POST /register-interest endpoint
│   ├── TASK: Build register interest page
│   └── TEST: Functional — submission stored in S3
│
├── STORY: SND-1 — Drag-and-drop file upload with encryption
│   ├── TASK: Build file drop zone UI component
│   ├── TASK: Implement AES-256-GCM encryption in browser (Web Crypto API)
│   ├── TASK: Implement POST /transfers endpoint (token validation + pre-signed URL)
│   ├── TASK: Implement direct-to-S3 upload via pre-signed PUT URL
│   ├── TASK: Implement POST /transfers/{id}/complete endpoint
│   └── TEST: E2E — file upload flow (drop → encrypt → upload → complete)
│
├── STORY: SND-2 — Download link + decryption key display
│   ├── TASK: Build upload-complete page with copy buttons
│   ├── TASK: Display key in base64url format
│   └── TEST: E2E — verify link and key are copyable and correct
│
├── STORY: SND-3 — Separate-channel sharing guidance
│   ├── TASK: Add guidance text + UI callout on upload-complete page
│   └── TEST: Content review — guidance is clear and not alarming
│
├── STORY: SND-4 — Transparency panel (upload)
│   ├── TASK: Return captured metadata in /transfers/{id}/complete response
│   ├── TASK: Build transparency panel UI component
│   └── TEST: Functional — IP address, timestamp, stored-fields are accurate
│
├── STORY: SND-5 — Transfer status page (live download tracking)
│   ├── TASK: Implement GET /transfers/{id} endpoint (metadata + events)
│   ├── TASK: Build status page with download event list
│   ├── TASK: Add polling or refresh mechanism for live updates
│   └── TEST: E2E — status page updates after receiver downloads
│
├── STORY: SND-6 — Access token authentication
│   ├── TASK: Implement token validation middleware
│   ├── TASK: Build token input UI on upload page
│   └── TEST: Functional — invalid token rejected, valid token accepted
│
├── STORY: SND-7 — Text/secret sharing mode
│   ├── TASK: Add text input mode to upload page
│   ├── TASK: Encrypt text as binary blob (same flow as files)
│   └── TEST: E2E — share text → receive and decrypt text
│
├── STORY: RCV-1 — Download and decrypt in browser
│   ├── TASK: Build download page with key input
│   ├── TASK: Implement GET /transfers/{id}/download (pre-signed GET URL)
│   ├── TASK: Implement client-side AES-256-GCM decryption
│   ├── TASK: Trigger browser "Save As" for decrypted file
│   └── TEST: E2E — full download → decrypt → save flow
│
├── STORY: RCV-2 — Transparency panel (download)
│   ├── TASK: Return captured metadata in /transfers/{id}/download response
│   ├── TASK: Build transparency panel on download page
│   └── TEST: Functional — IP, user-agent, timestamp displayed correctly
│
├── STORY: RCV-3 — How-it-works explanation
│   ├── TASK: Write copy explaining Secure Send's encryption model
│   ├── TASK: Build "How it works" page or modal
│   └── TEST: Content review — explanation is clear and trustworthy
│
├── STORY: RCV-5 — Wrong key error handling
│   ├── TASK: Detect AES-GCM authentication tag failure
│   ├── TASK: Display clear "wrong key" error message
│   └── TEST: E2E — wrong key shows error, correct key works
│
├── STORY: SEC-1 + SEC-2 — Client-side encryption, key never sent to server
│   └── (covered by SND-1 encryption tasks + crypto spike)
│
├── STORY: SEC-4 — S3 encryption at rest
│   ├── TASK: Enable SSE-S3 on data bucket
│   └── TEST: Verify encryption headers on S3 objects
│
├── STORY: SEC-5 — Server-side ciphertext validation
│   ├── TASK: Add binary content check on upload-complete (verify not plaintext)
│   └── TEST: Functional — plaintext upload rejected
│
├── STORY: SEC-6 — Transparency panel accuracy
│   └── (covered by SND-4 and RCV-2 tasks)
│
├── STORY: SEC-7 — Token validation on all upload endpoints
│   └── (covered by SND-6 tasks)
│
├── DEPLOY: Dev environment setup
│   ├── TASK: M-Graph config for dev
│   ├── TASK: S3 buckets (data + frontend + config) for dev
│   └── TEST: Deploy verification checklist — dev
│
├── DEPLOY: QA environment setup
│   ├── TASK: M-Graph config for qa
│   ├── TASK: S3 buckets (data + frontend + config) for qa
│   └── TEST: Deploy verification checklist — qa
│
└── DEPLOY: Prod release
    ├── TASK: M-Graph config for prod
    ├── TASK: S3 buckets (data + frontend + config) for prod
    ├── TEST: Deploy verification checklist — prod
    └── TEST: Smoke tests — prod
```

---

## 11. Open Questions & Decisions

| # | Question | Options | Decision |
|---|----------|---------|----------|
| 1 | Max file size for MVP | 50MB (simple), 100MB (reasonable), 500MB+ (requires multipart) | Architect to recommend |
| 2 | File expiry default | 24 hours, 7 days, 30 days | 7 days (adjustable per-token later) |
| 3 | Frontend framework | Vanilla JS (minimal deps) vs lightweight framework (Preact, Alpine) | Architect to recommend |
| 4 | Admin auth for MVP | Hardcoded admin key vs environment variable vs JWT | Environment variable (simplest) |
| 5 | Live status updates | Polling (simple) vs WebSocket (responsive) vs SSE | Polling for MVP (5s interval) |
| 6 | Text/secret mode (SND-7) | Include in MVP or defer | Include (trivial — same encryption, text → blob) |
| 7 | Token format | UUID vs short code (tok_abc123) vs custom | Short prefixed code `tok_` for readability |
| 8 | Download page — require token? | Token required (sender+receiver both need tokens) vs public download | Public download (content is encrypted, token not needed) |
| 9 | Multi-file transfer | Single file per transfer vs zip-multiple | Single file MVP; future: client-side zip before encrypt |
| 10 | Custom domain | Use existing domain or new | Operator to decide |

---

## 12. Out of Scope (v1)

- User accounts / registration / sign-up flow
- Email delivery of download links (manual share only)
- Resumable uploads (if upload fails, restart from scratch)
- File preview in browser (PDF viewer, image viewer, etc.)
- Multiple files per transfer (zip first or defer to v2)
- Billing / payment system (free beta)
- End-to-end encrypted email notification of download events
- Mobile native app
- Files > 500MB (multipart upload complexity)
- Self-destructing / one-time-download transfers (future feature)
- Audit log export (admin can read S3 directly for MVP)

---

## 13. Future Roadmap (Post-MVP)

| Phase | Feature | Notes |
|-------|---------|-------|
| v1.1 | Email delivery — send download link via email from within the app | Requires SES integration |
| v1.1 | One-time download — file auto-deletes after first successful download | Self-destruct mode |
| v2 | Billing — Stripe integration, usage-based pricing | Token generation tied to payment |
| v2 | Multi-file transfers — client-side zip before encryption | Or individual file encryption |
| v2 | Large file support (>500MB) — S3 multipart upload with pre-signed URLs | Chunked encryption |
| v3 | Public registration — self-service accounts replace manual token distribution | Full auth system |
| v3 | Teams — shared transfer history within an organisation | Multi-user admin |

---

## 14. Next Steps

1. **Conductor** instantiates the Issues FS tree from Section 10
2. **Architect** picks up the crypto spike (Web Crypto AES-GCM) and pre-signed URL spike
3. **Developer** sets up M-Graph project scaffold and dev environment
4. **QA** drafts test plans from the user stories
5. **Documentarian** begins user-facing copy (how-it-works, transparency explanations)
6. All agents coordinate via Issues FS issue transitions and Claude Teams orchestration

---

*This brief should be loaded into the Claude Teams conductor agent as the source-of-truth project definition. All work items derive from this document and are tracked via Issues FS.*
