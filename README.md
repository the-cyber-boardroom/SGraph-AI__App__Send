# SGraph Send

**Zero-knowledge encrypted file sharing.** The server never sees your files.

[send.sgraph.ai](https://send.sgraph.ai) | Currently in private beta

---

## How It Works

A complete walkthrough of the upload-to-download flow. The server never sees your plaintext, your file name, or your decryption key at any point.

### Step 1: Select a file

Drop a file into the upload zone or click to browse. No account required.

<img width="600" alt="Upload page with drop zone and test files section" src="https://github.com/user-attachments/assets/f6a37952-fddf-4842-877a-4d59b9ee81ee" />

### Step 2: Encrypt and upload

Your file is shown with its size. Click "Encrypt & Upload" -- encryption happens entirely in your browser using AES-256-GCM before anything leaves your device.

<img width="600" alt="File selected, showing test-data.json ready for encryption" src="https://github.com/user-attachments/assets/fb5e68b7-a741-4aff-a816-99974695a067" />

### Step 3: Share the link and key separately

After upload, you get two things: a download link and a decryption key, each with its own copy button. The security tip reminds you to share these through different channels. The transparency panel proves what was stored (encrypted file, size) and what was NOT stored (file name, decryption key, raw IP).

<img width="600" alt="File sent with download link, decryption key, and transparency panel" src="https://github.com/user-attachments/assets/f5bcbf42-36d1-4c4d-abc0-83bc3083c48a" />

### Step 4: Recipient opens the download link

The recipient sees the encrypted file metadata and a field to paste the decryption key. The server never sees the key -- it is shared out-of-band between sender and recipient.

<img width="600" alt="Download page showing encrypted file and decryption key input" src="https://github.com/user-attachments/assets/2bcf7574-8eb7-4456-9a0f-442bd5d7a644" />

### Step 5: File decrypted locally

The file is decrypted in the recipient's browser. The transparency panel confirms: file content was encrypted (the server could not read it), the decryption key was NOT stored (only you have it), and the file name was never sent to the server.

<img width="600" alt="Download confirmation with transparency panel showing zero-knowledge proof" src="https://github.com/user-attachments/assets/a7e52ea7-d310-4f9a-8c77-8ca752dc77e0" />

### Step 6: Original file, intact

The downloaded file is identical to the original. The server only ever had encrypted bytes -- it could not read, modify, or inspect the contents at any point.

<img width="600" alt="Original test-data.json opened in text editor, content intact" src="https://github.com/user-attachments/assets/2b8f882f-1526-4084-928d-90c9602227e5" />

---

## Why This Exists

Most file sharing services require you to trust the provider with your unencrypted data. SGraph Send takes a different approach: the server is architecturally unable to read what you share.

- No accounts required
- No tracking, no cookies, no local storage
- The server stores only encrypted bytes it cannot decrypt
- IP addresses are hashed with a daily rotating salt — stored as one-way hashes, never in the clear

---

## Architecture

| Component | Detail |
|-----------|--------|
| **Two Lambda functions** | User-facing (transfers, health, static UI) and Admin (tokens, stats) |
| **Endpoints** | Lambda Function URLs — direct HTTPS, no API Gateway |
| **Storage** | S3 via Memory-FS abstraction (pluggable: memory, disk, S3) |
| **Encryption** | Web Crypto API, AES-256-GCM, client-side only |
| **Frontend** | IFD Web Components — vanilla JS, zero framework dependencies |
| **Backend** | FastAPI + Mangum via [osbot-fast-api](https://github.com/owasp-sbot/OSBot-Fast-API) |
| **Type system** | Type_Safe from [osbot-utils](https://github.com/owasp-sbot/OSBot-Utils) (no Pydantic) |

Three UIs serve different audiences: the user workflow, power user tools, and an admin console.

---

## The Agentic Team

This project is built and maintained by a **15-role AI agentic team** coordinated through Claude Code, with a human stakeholder (Dinis Cruz) providing direction through written briefs.

**Roles:** Architect, Dev, QA, DevOps, AppSec, GRC, DPO, Advocate, Sherpa, Ambassador, Journalist, Historian, Cartographer, Librarian, and Conductor.

Each role produces structured review documents, tracks decisions, and operates within defined boundaries. The team's work is fully visible in the repo:

- [`team/roles/`](team/roles/) — all role definitions and review documents
- [`team/humans/dinis_cruz/briefs/`](team/humans/dinis_cruz/briefs/) — stakeholder briefs driving priorities
- [`.claude/CLAUDE.md`](.claude/CLAUDE.md) — agent guidance, stack rules, and project conventions

---

## Key Documents

| Document | Path |
|----------|------|
| Project brief | [`library/docs/_to_process/project - Secure Send Service brief.md`](library/docs/_to_process/project%20-%20Secure%20Send%20Service%20brief.md) |
| Phase roadmap | [`library/roadmap/phases/v0.1.1__phase-overview.md`](library/roadmap/phases/v0.1.1__phase-overview.md) |
| Agent guidance | [`.claude/CLAUDE.md`](.claude/CLAUDE.md) |
| Development guides | [`library/guides/`](library/guides/) |
| Issue tracking | [`.issues/`](.issues/) |

---

## Project Structure

```
sgraph_ai_app_send/              # Application code
  lambda__admin/                 # Admin Lambda (FastAPI + Mangum)
  lambda__user/                  # User Lambda (FastAPI + Mangum)

sgraph_ai_app_send__ui__admin/   # Admin UI (static assets)
sgraph_ai_app_send__ui__user/    # User UI (static assets)

tests/unit/                      # Tests (no mocks, real in-memory stack)

.issues/                         # File-based issue tracking
library/                         # Specs, guides, roadmap, dependencies
team/                            # Agentic team roles, reviews, briefs
```

---

## Development

Requires **Python 3.12**.

```bash
# Install dependencies
poetry install

# Run tests
poetry run pytest tests/unit/ -v
```

All tests use real implementations with an in-memory storage backend. No mocks, no patches. The full stack starts in under 3 seconds.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Python 3.12 / arm64 |
| Web framework | FastAPI via osbot-fast-api / osbot-fast-api-serverless |
| Lambda adapter | Mangum |
| Storage | Memory-FS (pluggable: memory, disk, S3) |
| AWS operations | osbot-aws |
| Type system | Type_Safe (osbot-utils) |
| Frontend | Vanilla JS + Web Components (IFD) |
| Encryption | Web Crypto API (AES-256-GCM) |
| Testing | pytest, in-memory stack, no mocks |
| CI/CD | GitHub Actions (test, tag, deploy) |

---

## Status

**v0.2.21** — S3 persistent storage live. End-to-end encryption working. CI/CD pipeline deploying automatically. 56 tests passing. Private beta phase.

---

## License

Apache 2.0
