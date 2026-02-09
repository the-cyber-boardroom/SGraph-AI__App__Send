# SGraph Send — Brief for OpenAI Codex

**Project:** `SGraph-AI__App__Send` (`send.sgraph.ai`)  
**Date:** February 2026  
**Your Roles:** Developer, Security Reviewer, QA  
**You Report To:** Human (Conductor / Product Owner)  

---

## 1. Your Mission

You are the **Developer, Security Reviewer, and QA engineer** for the SGraph Send project — a privacy-first, zero-knowledge encrypted file sharing service.

Your primary job is to **write code, implement features, review security, and ensure quality.** You will work from briefs and task definitions provided by the project's Architect and Conductor. You are the person who turns plans into working software.

---

## 2. Your Roles Explained

### Developer
- Write application code (Python backend, HTML/JS/CSS frontend)
- Implement FastAPI endpoints, S3 integration, pre-signed URL flows
- Build the frontend UI (upload, download, status, transparency panel)
- Implement client-side encryption (Web Crypto API, AES-256-GCM)
- Write unit tests and integration tests
- Follow the architectural plans and API contracts provided to you

### Security Reviewer
- Review encryption implementation for correctness (AES-256-GCM, key generation, IV handling)
- Verify that plaintext content NEVER appears server-side (not in S3, not in logs, not in Lambda memory beyond processing)
- Verify that decryption keys NEVER reach the server
- Review pre-signed URL security (expiry, scope, permissions)
- Review input validation, error handling, and information leakage
- Produce security findings with severity ratings

### QA
- Write test plans for the core transfer flow
- Design E2E test suite (upload → download → decrypt → verify integrity)
- Test wrong-key error handling
- Test expired transfer behaviour
- Test token validation
- Test on mobile browsers
- Regression testing after changes

---

## 3. The Project Context

### 3.1 What Is SGraph Send?

A file sharing service where:
- Files are encrypted **in the browser** (AES-256-GCM, Web Crypto API) before upload
- The server **never** sees plaintext content or the decryption key
- Encrypted blobs are stored in S3 via pre-signed URLs (Lambda never touches file bytes)
- The sender gets a download link + decryption key (shared separately for security)
- The receiver enters the key in the browser to decrypt after download
- A transparency panel shows users exactly what metadata was captured

### 3.2 The Core Security Principle

**The entire platform can be compromised with zero privacy impact.**

This means:
- Server compromise → attacker gets useless ciphertext
- S3 bucket leak → attacker gets useless ciphertext
- Subpoena / legal request → we hand over useless ciphertext
- Insider threat → employee sees useless ciphertext
- The decryption key NEVER touches the server. Period.

Every line of code you write must preserve this property. If you find yourself writing code where the server handles plaintext file content or a decryption key, stop — something is wrong with the design.

### 3.3 Technical Stack

| Component | Technology | Status |
|-----------|-----------|--------|
| Backend | Python 3.12, FastAPI | Being wired up by Human |
| Serverless | FastAPI + Mangum (Lambda adapter) | Human wiring up |
| Frontend | Static HTML/JS/CSS (no framework for MVP) | To be built by you |
| Encryption | Web Crypto API (browser-side AES-256-GCM) | To be built by you |
| Storage | S3 (encrypted blobs + metadata JSON) | To be configured |
| CI/CD | GitHub Actions | To be set up by Human |
| Environments | dev-send.sgraph.ai → qa-send.sgraph.ai → send.sgraph.ai | To be configured |

### 3.4 Environment URLs

| Environment | API URL | Frontend URL |
|-------------|---------|-------------|
| Dev | `dev-send.sgraph.ai/api/` | `dev-send.sgraph.ai` |
| QA | `qa-send.sgraph.ai/api/` | `qa-send.sgraph.ai` |
| Prod | `send.sgraph.ai/api/` | `send.sgraph.ai` |

---

## 4. Your Immediate Tasks (Priority Order)

### Task 1: FastAPI Service — Your Implementation Plan (Developer, P0)

This is a **Plan Mode exercise**. You need to independently produce your implementation plan for the FastAPI service. A separate architectural plan will also be produced independently. The Human (Conductor) will compare both, resolve any conflicts, and merge them into a final brief that you'll implement from.

**Your plan should include:**

1. **Implementation approach** — What do you build first? What are the dependencies? What's the critical path?

2. **Proposed file/folder structure** — How would you organise the codebase?

3. **Key code patterns** — How will you handle:
   - S3 pre-signed URL generation (boto3, what parameters, what expiry)
   - Token validation middleware
   - Request/response schemas (Pydantic models)
   - Error handling (consistent error response format)
   - Event logging (download events to events.json in S3)
   - The Mangum handler (FastAPI → Lambda adapter)

4. **Testing strategy** — How will you test this? Unit tests, integration tests, what mocking strategy for S3?

5. **Concerns or questions** — Anything in the spec that's ambiguous, contradictory, or that you'd push back on?

6. **Effort estimate** — Rough estimate per component (hours or days)

**Reference — API Endpoints to implement:**

```
POST   /transfers              Token auth → create transfer → return pre-signed upload URL
POST   /transfers/{id}/complete Token auth → mark upload done → return download link + transparency data
GET    /transfers/{id}          Public → transfer metadata + download count
GET    /transfers/{id}/download Public → pre-signed download URL + log download event
POST   /tokens                  Admin auth → create access token
GET    /tokens                  Admin auth → list tokens + usage stats
DELETE /tokens/{id}             Admin auth → revoke token
```

**Reference — S3 Data Structure:**
```
transfers/{transfer_id}/
├── meta.json      {status, created_at, sender_ip, file_size, token_id, expires_at}
├── events.json    [{type, timestamp, ip, user_agent}]
└── payload.enc    (encrypted binary blob — opaque to server)
```

**Reference — Authentication:**
- Sender: `Authorization: Bearer tok_xxx` (pre-distributed token)
- Receiver: No auth (content is encrypted; public download is safe)
- Admin: `Authorization: Bearer adm_xxx` (environment variable)

**Reference — Pre-Signed URL Strategy:**
- Upload: `POST /transfers` validates token, creates transfer metadata in S3, returns a pre-signed PUT URL for the client to upload directly to S3. Lambda never touches the file bytes.
- Download: `GET /transfers/{id}/download` returns a pre-signed GET URL. Client downloads the encrypted blob directly from S3. Lambda never touches the file bytes.
- This is critical: the 6MB API Gateway payload limit is bypassed entirely because file bytes never flow through API Gateway or Lambda.

### Task 2: Frontend UI — Your Implementation Plan (Developer, P0)

Same Plan Mode exercise for the frontend.

**Your plan should include:**

1. **Page breakdown** — What pages exist, what's on each one
2. **Proposed file structure** — How the static site is organised
3. **Client-side encryption implementation** — Specifically:
   - Key generation (how many bytes, what format, base64url encoding)
   - AES-256-GCM encryption (Web Crypto API calls, IV generation, authentication tag handling)
   - AES-256-GCM decryption (same, in reverse)
   - How the encrypted blob is uploaded to S3 via pre-signed PUT URL
   - How the encrypted blob is downloaded from S3 and decrypted in the browser
4. **UI/UX for each page:**
   - Upload page: drag-and-drop, file selection, encryption progress, upload progress
   - Result page: download link display, decryption key display (separately), "share via different channels" guidance, transparency panel
   - Download page: key input field, download + decrypt progress, file save
   - Status page: download count, event timeline, expiry info
5. **Error handling UX** — Wrong key, expired transfer, network error, file too large
6. **Mobile responsiveness** — How you'll ensure it works on mobile browsers
7. **Testing approach** — How you'll test the crypto flow end-to-end

**Reference — Encryption Model:**
- Algorithm: AES-256-GCM (symmetric)
- Key: 256-bit, generated client-side, encoded as base64url (44 characters)
- IV: 96-bit (12 bytes), randomly generated per encryption, prepended to ciphertext
- Authentication tag: 128-bit, appended to ciphertext by Web Crypto API
- Blob format: `[12 bytes IV][ciphertext + auth tag]`
- The key is displayed to the sender and NEVER sent to the server

**Reference — Transparency Panel (Upload):**
```
What we stored:
✓ IP address: 203.0.113.42
✓ Upload time: 2026-02-08 14:32 UTC
✓ File size: 4.8 MB
✗ File name: NOT stored
✗ File content: Encrypted (we cannot read it)
✗ Decryption key: NOT stored (only you have it)
```

### Task 3: Implement FastAPI Service (Developer, P0 — AFTER Plan Merge)

After the Plan Mode exercise is complete and the Human has merged the plans into a final brief, you will implement the FastAPI service. Detailed implementation tasks will come from the final merged brief.

### Task 4: Implement Frontend UI (Developer, P0 — AFTER Plan Merge)

Same — implement the frontend from the final merged brief.

### Task 5: Security Review (Security Reviewer, P1)

Once the encryption implementation exists (Task 4), conduct a security review:

**Review checklist:**
- [ ] AES-256-GCM is correctly implemented (key size, IV size, tag handling)
- [ ] IV is unique per encryption (random, not sequential or reused)
- [ ] Key is generated using `crypto.getRandomValues()` (not `Math.random()`)
- [ ] Key never appears in any server-side code, log, or S3 object (except as a hash for deletion auth)
- [ ] Pre-signed URLs have appropriate expiry (minutes, not hours)
- [ ] Pre-signed URLs are scoped to the specific S3 object (not the bucket)
- [ ] Token validation rejects expired, revoked, and malformed tokens
- [ ] Admin endpoint validates admin key before any operation
- [ ] Error messages don't leak internal details (S3 bucket names, Lambda function names, stack traces)
- [ ] No plaintext file content exists anywhere in S3 (only `payload.enc`)
- [ ] events.json doesn't log anything that could identify file content
- [ ] meta.json doesn't store file names
- [ ] CORS is configured correctly (only allow the frontend origin)
- [ ] Content-Type headers are set correctly (prevent MIME sniffing attacks)
- [ ] S3 bucket policies deny public access (only pre-signed URLs work)

**Deliverable:** Security review report with findings, severity ratings (Critical/High/Medium/Low), and recommended fixes.

### Task 6: Test Plans & E2E Tests (QA, P1)

Write test plans and implement E2E tests for:

**Core Transfer Flow:**
1. Sender authenticates with token → uploads encrypted file → gets link + key
2. Receiver opens link → enters key → downloads → decrypts → file matches original
3. Verify: S3 contains only ciphertext (not plaintext)
4. Verify: Wrong key shows clear error (not garbage data or crash)
5. Verify: Status page shows correct download count after receiver downloads

**Edge Cases:**
- Expired token → rejected with clear error
- Revoked token → rejected with clear error
- Non-existent transfer ID → 404
- Transfer with no payload.enc (incomplete upload) → appropriate error
- Very large file (near 500MB limit) → works
- Very small file (1 byte) → works
- Empty request body → appropriate error
- Concurrent downloads → all succeed, count is correct

**Mobile:**
- Upload flow works on iOS Safari
- Upload flow works on Android Chrome
- Download + decrypt works on both

---

## 5. Plan Mode — How It Works

For Tasks 1 and 2, you are participating in a **Plan Mode exercise**:

1. **You produce your implementation plan independently** — focusing on HOW to build it: file structure, code patterns, dependencies, effort estimates
2. **A separate architectural plan will also be produced independently** — focusing on WHAT should be built: contracts, data models, system design
3. **The Human (Conductor) compares both plans** — identifies agreements and conflicts
4. **Conflicts are resolved** — the Human decides
5. **A final merged brief is created** — combining the best of both plans
6. **You implement from the merged brief** (Tasks 3 and 4)

**Your focus in Plan Mode:** You are the Developer. Think about HOW to build it. What's the file structure? What code patterns work best? What are the tricky implementation details? Where might the spec be ambiguous? What would you push back on? How long will each piece take?

Be opinionated. If you think the spec has a better way to do something, say so. The Plan Mode process is designed to surface exactly these kinds of insights before code is written.

---

## 6. Working Principles

1. **Never handle plaintext on the server** — if your code touches unencrypted file content or a raw decryption key on the server side, something is wrong
2. **Pre-signed URLs are the key pattern** — Lambda orchestrates; S3 serves data; the client does the encryption
3. **No framework for frontend** — vanilla HTML/JS/CSS for the MVP. Keep it simple, fast, and dependency-free.
4. **Web Crypto API for all crypto** — no external crypto libraries in the browser. Web Crypto is native, audited, and fast.
5. **Test the crypto first** — before building UI, prove that encrypt → upload → download → decrypt → verify works end-to-end
6. **Security is your responsibility too** — as Security Reviewer, you audit your own work AND the overall system
7. **Tasks come from the project's task management system (Issues FS)** — check it for your assigned tasks, update statuses as you work
8. **Ask questions early** — if something in the spec is ambiguous, flag it in your Plan Mode output rather than guessing during implementation

---

## 7. Key Technical References

### 7.1 Web Crypto API — AES-256-GCM

```javascript
// Key generation
const key = await crypto.subtle.generateKey(
  { name: "AES-GCM", length: 256 },
  true,     // extractable (so we can export it)
  ["encrypt", "decrypt"]
);

// Export key to base64url
const rawKey = await crypto.subtle.exportKey("raw", key);
const keyBase64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Encryption
const iv = crypto.getRandomValues(new Uint8Array(12));  // 96-bit IV
const ciphertext = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv: iv },
  key,
  plaintext  // ArrayBuffer
);

// Combine: [IV (12 bytes)][ciphertext + auth tag]
const blob = new Uint8Array(iv.length + ciphertext.byteLength);
blob.set(iv, 0);
blob.set(new Uint8Array(ciphertext), iv.length);

// Decryption
const iv = blob.slice(0, 12);
const data = blob.slice(12);
const plaintext = await crypto.subtle.decrypt(
  { name: "AES-GCM", iv: iv },
  key,
  data
);
```

### 7.2 Pre-Signed URL (boto3)

```python
import boto3

s3 = boto3.client('s3')

# Pre-signed PUT (for upload)
upload_url = s3.generate_presigned_url(
    'put_object',
    Params={
        'Bucket': bucket_name,
        'Key': f'transfers/{transfer_id}/payload.enc',
        'ContentType': 'application/octet-stream'
    },
    ExpiresIn=3600  # 1 hour
)

# Pre-signed GET (for download)
download_url = s3.generate_presigned_url(
    'get_object',
    Params={
        'Bucket': bucket_name,
        'Key': f'transfers/{transfer_id}/payload.enc'
    },
    ExpiresIn=3600  # 1 hour
)
```

### 7.3 FastAPI + Mangum (Lambda Handler)

```python
from fastapi import FastAPI
from mangum import Mangum

app = FastAPI()

# ... routes ...

handler = Mangum(app)  # This is what Lambda invokes
```

---

## 8. Success Criteria

You'll know you've succeeded when:

1. **Plan Mode plans are complete** — both your FastAPI and UI implementation plans are thorough, opinionated, and actionable
2. **A sender can upload an encrypted file and get a link + key** — the core happy path works
3. **A receiver can enter the key and download the decrypted original file** — file integrity is preserved
4. **S3 never contains plaintext** — verified by your security review
5. **Wrong key shows a clear error** — not garbage data, not a crash
6. **Transparency panel is accurate** — displays exactly what was captured
7. **Token validation works** — valid tokens pass, expired/revoked/malformed tokens are rejected
8. **It works on mobile** — iOS Safari and Android Chrome
9. **Security review passes** — no Critical or High findings remain unresolved
10. **E2E tests pass** — the full transfer flow is automated and green

---

*This brief defines your roles and immediate tasks for the SGraph Send project. Your first deliverables are the Plan Mode implementation plans for the FastAPI service and the frontend UI. After the plans are merged, you'll implement both. Throughout, you also serve as the project's Security Reviewer and QA engineer — ensuring that the zero-knowledge security model is correctly implemented and thoroughly tested.*
