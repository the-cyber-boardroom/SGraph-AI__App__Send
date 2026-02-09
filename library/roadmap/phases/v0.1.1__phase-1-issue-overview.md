# Phase 1 (MVP) — Full Issue Overview

**Project:** SGraph Send
**Phase:** Phase-1 — MVP Core Transfer Flow
**Total Features:** 8 | **Total Tasks:** 39 | **P0:** 26 | **P1:** 13
**Status:** All backlog

---

## Summary by Feature

| # | Feature | Priority | Tasks | Stories |
|---|---------|----------|-------|---------|
| 1 | [Core Transfer Flow (Upload)](#feature-1-core-transfer-flow-upload) | P0 | 6 | SND-1, SND-2, SND-6, SEC-1, SEC-2 |
| 2 | [Token Management](#feature-2-token-management) | P0 | 5 | ADM-1, ADM-3, SEC-7 |
| 3 | [Download & Decrypt](#feature-3-download--decrypt) | P0 | 4 | RCV-1, RCV-5, SEC-3 |
| 4 | [Transparency Panels](#feature-4-transparency-panels) | P0 | 4 | SND-4, RCV-2, SEC-6 |
| 5 | [Status & Analytics](#feature-5-status--analytics) | P1 | 4 | SND-5, ADM-2 |
| 6 | [UI & UX Polish](#feature-6-ui--ux-polish) | P1 | 5 | SND-3, SND-7, RCV-3, ADM-4 |
| 7 | [Security Hardening](#feature-7-security-hardening) | P1 | 4 | SEC-4, SEC-5 |
| 8 | [Infrastructure & Deployment](#feature-8-infrastructure--deployment) | P0 | 7 | (deployment) |

---

## All Tasks

### Feature-1: Core Transfer Flow (Upload)

| Task | Title | P | Stories | Acceptance Criteria |
|------|-------|---|---------|---------------------|
| 1-1 | Implement POST /transfers endpoint | P0 | SND-1, SND-2, SEC-1 | Valid token → 201 with transfer_id + pre-signed URL. Invalid token → 401. |
| 1-2 | Implement POST /transfers/{id}/complete | P0 | SND-2, SND-6 | Status transitions pending→completed. Response includes transparency object. |
| 1-3 | Implement client-side AES-256-GCM encryption | P0 | SEC-1, SEC-2 | Encrypted blob is binary. Key is 44-char base64url. Same key decrypts to original. |
| 1-4 | Implement direct-to-S3 upload via pre-signed PUT | P0 | SND-1, SND-2 | File at transfers/{id}/payload.enc. Works up to 100MB. Progress bar shows %. |
| 1-5 | Build upload page with drop zone + token input | P0 | SND-1, SND-6 | Drop file, enter token, click upload. Shows encryption then upload progress. |
| 1-6 | Build upload-complete page with link + key | P0 | SND-2, SND-6 | Both link and key have working copy buttons. Key in base64url format. |

### Feature-2: Token Management

| Task | Title | P | Stories | Acceptance Criteria |
|------|-------|---|---------|---------------------|
| 2-1 | Design token data model | P0 | ADM-1 | Schema documented with sample JSON. tokens/{id}.json in config bucket. |
| 2-2 | Implement POST /tokens (admin) | P0 | ADM-1, SEC-7 | Valid admin key → 201 with new tok_ prefixed token. Invalid → 401. |
| 2-3 | Implement GET /tokens (admin) | P0 | ADM-1, ADM-3 | Returns array with usage_count, last_used_at, status per token. |
| 2-4 | Implement DELETE /tokens/{id} (admin) | P0 | ADM-1, SEC-7 | Token status → revoked. Revoked tokens rejected on subsequent calls. |
| 2-5 | Implement token validation middleware | P0 | SEC-7 | Valid active token passes. Revoked/missing/expired → 401. |

### Feature-3: Download & Decrypt

| Task | Title | P | Stories | Acceptance Criteria |
|------|-------|---|---------|---------------------|
| 3-1 | Implement GET /transfers/{id}/download | P0 | RCV-1 | Returns pre-signed GET URL. Event logged in events.json. Transparency included. |
| 3-2 | Implement client-side AES-256-GCM decryption | P0 | SEC-3, RCV-5 | Correct key → original file. Wrong key → clear error (not corrupted download). |
| 3-3 | Build download page with key input | P0 | RCV-1, RCV-5 | Shows metadata, key input, Download & Decrypt button. Triggers Save As. |
| 3-4 | Implement wrong-key error handling | P0 | RCV-5 | User-friendly "wrong key" error. User can re-enter and retry. |

### Feature-4: Transparency Panels

| Task | Title | P | Stories | Acceptance Criteria |
|------|-------|---|---------|---------------------|
| 4-1 | Build transparency panel UI component | P0 | SND-4, RCV-2 | Renders correctly. Shows real IP and timestamp. NOT stored fields marked. |
| 4-2 | Integrate panel on upload-complete page | P0 | SND-4, SEC-6 | Shows correct IP, upload timestamp, file size. File name/content/key NOT stored. |
| 4-3 | Integrate panel on download page | P0 | RCV-2, SEC-6 | Shows correct IP, user-agent, download timestamp. |
| 4-4 | Return captured metadata in API responses | P0 | SEC-6 | Both /complete and /download return transparency objects. IP matches request. |

### Feature-5: Status & Analytics

| Task | Title | P | Stories | Acceptance Criteria |
|------|-------|---|---------|---------------------|
| 5-1 | Implement GET /transfers/{id} endpoint | P1 | SND-5 | Returns correct metadata. download_count increments after each download. |
| 5-2 | Build transfer status page (sender view) | P1 | SND-5 | Auto-updates when downloads occur. Lists events with timestamps. |
| 5-3 | Implement GET /admin/stats endpoint | P1 | ADM-2 | Stats reflect actual data. Admin key required. |
| 5-4 | Build admin dashboard page | P1 | ADM-2 | Loads with correct stats. No PII beyond token metadata visible. |

### Feature-6: UI & UX Polish

| Task | Title | P | Stories | Acceptance Criteria |
|------|-------|---|---------|---------------------|
| 6-1 | Add separate-channel sharing guidance | P1 | SND-3 | Visible, clear, not alarming. Suggests specific channel combinations. |
| 6-2 | Implement text/secret sharing mode | P1 | SND-7 | Enter text, encrypt, share link+key. Receiver decrypts and sees original text. |
| 6-3 | Build How-it-Works page | P1 | RCV-3 | Clear, accurate, builds trust. Accessible from sender and receiver views. |
| 6-4 | Implement POST /register-interest | P1 | ADM-4 | Stored in S3. Rate limited (5/hour per IP). |
| 6-5 | Build register-interest page | P1 | ADM-4 | Form submits. Confirmation shown. Data stored. |

### Feature-7: Security Hardening

| Task | Title | P | Stories | Acceptance Criteria |
|------|-------|---|---------|---------------------|
| 7-1 | Enable S3 SSE-S3 encryption at rest | P1 | SEC-4 | All objects encrypted at rest. Encryption header visible. |
| 7-2 | Implement server-side ciphertext validation | P1 | SEC-5 | Plaintext upload rejected. Binary/encrypted content passes. |
| 7-3 | Configure CORS for frontend origin | P1 | SEC-4 | Frontend can call API. Other origins rejected. OPTIONS correct. |
| 7-4 | Implement rate limiting | P1 | SEC-5 | Excessive requests → 429. Normal usage unaffected. |

### Feature-8: Infrastructure & Deployment

| Task | Title | P | Stories | Acceptance Criteria |
|------|-------|---|---------|---------------------|
| 8-1 | Set up FastAPI application skeleton | P0 | — | /health returns 200. Runs on uvicorn locally and Lambda via Mangum. |
| 8-2 | Configure S3 buckets (dev) | P0 | — | Buckets exist. Public access blocked. SSE-S3 enabled. |
| 8-3 | Configure S3 buckets (qa) | P0 | — | QA buckets with same security config as dev. |
| 8-4 | Configure S3 buckets (prod) | P0 | — | Prod buckets with same security config. |
| 8-5 | Deploy FastAPI to Lambda (dev) | P0 | — | Lambda responds to /health. API Gateway routes correctly. |
| 8-6 | Set up static frontend hosting (dev) | P0 | — | Frontend loads at dev-send.sgraph.ai. HTTPS works. |
| 8-7 | Set up GitHub Actions CI/CD | P0 | — | Push to dev → auto-deploy. Tests run on PR. |

---

## Build Order

```
Feature-8 (Infrastructure) ──► Feature-2 (Tokens) ──► Feature-1 (Upload)
                                                         │
                                                         ▼
                                Feature-4 (Transparency) ◄── Feature-3 (Download)
                                                         │
                                                         ▼
                                Feature-5 (Status) ──► Feature-6 (UX Polish)
                                                   ──► Feature-7 (Security)
```

**Critical path:** Infrastructure → Tokens → Upload → Download → all else in parallel.

---

## Story Coverage

| Story | Description | Feature(s) |
|-------|-------------|------------|
| ADM-1 | Token generation and distribution | Feature-2 |
| ADM-2 | Usage analytics (no content visibility) | Feature-5 |
| ADM-3 | Token management (list, revoke) | Feature-2 |
| ADM-4 | Register interest / mailing list | Feature-6 |
| SND-1 | Drag-and-drop upload with encryption | Feature-1 |
| SND-2 | Download link + decryption key display | Feature-1 |
| SND-3 | Separate-channel sharing guidance | Feature-6 |
| SND-4 | Transparency panel (upload) | Feature-4 |
| SND-5 | Live transfer status | Feature-5 |
| SND-6 | Token-based authentication | Feature-1, Feature-2 |
| SND-7 | Text/secret sharing mode | Feature-6 |
| RCV-1 | Enter key → download → decrypt | Feature-3 |
| RCV-2 | Receiver transparency panel | Feature-4 |
| RCV-3 | How-it-works explanation | Feature-6 |
| RCV-5 | Wrong key error handling | Feature-3 |
| SEC-1 | Client-side AES-256-GCM encryption | Feature-1 |
| SEC-2 | Key never transmitted to server | Feature-1 |
| SEC-3 | URL useless without key | Feature-3 |
| SEC-4 | S3 SSE-S3 at rest | Feature-7 |
| SEC-5 | Ciphertext validation | Feature-7 |
| SEC-6 | Metadata displayed to user | Feature-4 |
| SEC-7 | Token validation | Feature-2 |
