# SG/Send — Project Context for QA Team

**Version:** v0.5.29
**Date:** 22 Feb 2026
**Purpose:** Give the QA project enough context to test SG/Send without needing to read the full codebase

---

## What is SG/Send?

SG/Send is a **zero-knowledge encrypted file sharing platform**. Files are encrypted in the browser using AES-256-GCM (Web Crypto API) before upload. The decryption key never leaves the sender's device. The server only stores encrypted ciphertext. It cannot decrypt anything.

**Live URL:** https://send.sgraph.ai/

---

## What Has Been Built (v0.5.29)

| Component | Status | What It Does |
|---|---|---|
| **User Lambda** | Deployed | Public-facing file transfer: upload encrypted files, download encrypted files, token-gated access |
| **Admin Lambda** | Deployed | Token management, PKI key registry, vault, metrics, cache browser |
| **User UI** | v0.1.6 deployed | Landing page with token gate, file upload (drag-drop), download + decrypt page |
| **Admin UI** | v0.1.5 deployed | Multi-page admin console: tokens, PKI, vault, key discovery, analytics, system info |
| **SSH Key Generator** | Deployed | Browser-based Ed25519/RSA key pair generator (standalone utility page) |
| **PKI System** | Working | Browser-based RSA-OAEP + ECDSA key management, encrypt/decrypt/sign messages |
| **Personal Vault** | In progress | PKI-keyed encrypted data storage |

---

## Architecture Summary

```
                    ┌──────────────────────────────────┐
                    │           CloudFront              │
                    │        send.sgraph.ai             │
                    └──────────┬───────────┬────────────┘
                               │           │
                    ┌──────────▼──┐  ┌─────▼──────────┐
                    │ User Lambda │  │ Admin Lambda    │
                    │ (public)    │  │ (auth-protected)│
                    │             │  │                 │
                    │ /send/      │  │ /admin/         │
                    │ /transfers/ │  │ /tokens/        │
                    │ /tools/     │  │ /keys/          │
                    │ /info/      │  │ /vault/         │
                    │             │  │ /metrics/       │
                    └──────┬──────┘  └────┬────────────┘
                           │              │
                    ┌──────▼──────────────▼──────┐
                    │        Memory-FS           │
                    │   (S3 backend in prod)     │
                    └────────────────────────────┘
```

- **Two Lambda functions** — User (public) and Admin (auth-protected), each as Lambda URL functions (direct HTTPS, no API Gateway)
- **FastAPI** via `osbot-fast-api` / `osbot-fast-api-serverless` with Mangum adapter
- **Memory-FS** — pluggable storage abstraction (memory for tests, S3 for production)
- **Web Components** — vanilla JS, zero framework dependencies, IFD methodology (surgical versioning)
- **All encryption client-side** — server never sees plaintext

---

## The User Lambda (Your Primary Test Target)

### URL Structure

| Path | What It Does |
|---|---|
| `/` | Redirects to `/send/` |
| `/send/` | Redirects to latest UI version (`/send/v0/v0.1/v0.1.6/index.html`) |
| `/send/v0/v0.1/v0.1.6/index.html` | Landing page + upload interface |
| `/send/v0/v0.1/v0.1.6/download.html` | Download + decrypt page |
| `/tools/ssh-keygen/v0/v0.1/v0.1.0/index.html` | SSH key generator utility |
| `/transfers/create` | POST — create a new encrypted transfer (requires token) |
| `/transfers/upload/{transfer_id}` | POST — upload encrypted payload (requires token) |
| `/transfers/complete/{transfer_id}` | POST — finalize transfer |
| `/transfers/info/{transfer_id}` | GET — transfer metadata |
| `/transfers/download/{transfer_id}` | GET — download encrypted payload |
| `/transfers/check-token/{token_name}` | GET — check token validity (public) |
| `/info/health` | GET — health check (no auth) |

### Authentication (User Side)

- Token-gated access, NOT global middleware
- User enters access token in the `<send-access-gate>` component
- Token stored in `localStorage['sgraph-send-access-token']`
- All transfer API calls include header: `x-sgraph-access-token: {token_value}`
- Token validated via HTTP call from User Lambda to Admin Lambda's `/tokens/lookup/{token_name}`
- Invalid token → 401 → UI shows red error: "Token not found. Please check and try again."
- Valid token → UI transitions to upload view

### User Flow (What You're Testing)

1. User lands on `/send/` → sees "Beta Access" page with lock icon
2. User enters access token → clicks [Go]
3. If invalid → red error banner
4. If valid → file upload interface appears:
   - File/Text toggle tabs
   - Drag-and-drop zone ("Drop your file here or click to browse")
   - "Encrypted in your browser before upload" notice
   - Usage counter ("N uses remaining")
   - [Change Token] button
   - Test Files section (test-text.txt, test-data.json)
5. User drops file → encrypted locally → uploaded → gets download link + key
6. Recipient opens download link → pastes key → decrypted locally → file saved

---

## The Admin Lambda (Secondary Test Target)

### URL Structure

| Path | What It Does |
|---|---|
| `/admin/` | Redirects to latest admin UI (`/admin/v0/v0.1/v0.1.5/index.html`) |
| `/tokens/create` | POST — create transfer token |
| `/tokens/lookup/{name}` | GET — token status |
| `/tokens/use/{name}` | POST — record token usage |
| `/tokens/revoke/{name}` | POST — disable token |
| `/tokens/list` | GET — all tokens |
| `/keys/publish` | POST — publish public key |
| `/keys/lookup/{code}` | GET — look up key by code |
| `/keys/list` | GET — all published keys |
| `/vault/*` | Vault operations |
| `/health/pulse` | GET — real-time traffic pulse (public) |
| `/info/health` | GET — health check |

### Authentication (Admin Side)

- **Global API key** auth (all routes except health/info)
- Header: configurable name (typically `X-API-Key`)
- Value: from environment variable
- Cookie auth also supported (set via `/set-cookie` endpoint)
- Missing/invalid key → 401

### Admin UI Pages

| Page | Component | What It Does |
|---|---|---|
| `index.html` | `<admin-shell>` | Main shell with navigation sidebar |
| `pki.html` | `<pki-keys>`, `<pki-encrypt>`, `<pki-contacts>` | PKI key management |
| Navigation: Tokens | `<token-manager>` | Token CRUD, usage stats |
| Navigation: Vault | `<vault-manager>` | Personal data vault |
| Navigation: Key Publish | `<key-publish>` | Register public keys |
| Navigation: Key Lookup | `<key-lookup>` | Search key registry |
| Navigation: Key Registry | `<key-registry>` | Full registry view |
| Navigation: Analytics | `<analytics-dashboard>` | Transfer analytics |
| Navigation: System | `<system-info>` | Version, uptime, service info |
| Navigation: Storage | `<storage-browser>` | Memory-FS content browser |

---

## Running SG/Send Locally

### Prerequisites

- Python 3.12
- Poetry (dependency manager)
- The SG/Send repo cloned

### Start Local Servers

```bash
# Terminal 1: Admin Lambda (port 10061)
scripts/admin__run-locally.sh

# Terminal 2: User Lambda (port 10062)
scripts/user__run-locally.sh
```

### Environment

Copy `.local-server.env.example` to `.local-server.env` and set:
```
SGRAPH_SEND__METRICS_USE_STUB=true
```

For stub mode (no AWS credentials needed — recommended for QA testing).

### Local URLs

| Service | URL |
|---|---|
| User landing page | http://localhost:10062/send/ |
| Admin console | http://localhost:10061/admin/ |
| User health check | http://localhost:10062/info/health |
| Admin health check | http://localhost:10061/info/health |

---

## Key Principles

| Principle | Detail |
|---|---|
| **Zero-knowledge** | Server never sees plaintext. Encryption in browser, decryption in browser. |
| **API-first** | Every action has an API endpoint. UIs are convenience layers on top of APIs. |
| **IFD web components** | Vanilla JS Web Components, event-driven messaging, surgical versioning. |
| **No mocks in tests** | Full stack starts in-memory in ~100ms. Real implementations, not fakes. |
| **Type_Safe** | All Python schemas use `Type_Safe` from `osbot-utils`. Never Pydantic. |
| **Memory-FS** | Storage abstraction. App code doesn't know if backend is memory, disk, or S3. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Python 3.12 / arm64 |
| Web framework | FastAPI via `osbot-fast-api` / `osbot-fast-api-serverless` |
| Lambda adapter | Mangum (via osbot-fast-api) |
| Storage | Memory-FS (`Storage_FS`) — S3 backend in production |
| AWS operations | `osbot-aws` (never boto3 directly) |
| Frontend | Vanilla JS + Web Components |
| Encryption | Web Crypto API (AES-256-GCM) |
| Testing | pytest, in-memory stack, no mocks |
| CI/CD | GitHub Actions: test → tag → deploy |

---

*QA Bootstrap Pack — Project Context — v0.5.29*
