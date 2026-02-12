# SGraph Send

**Zero-knowledge encrypted file sharing.** The server never sees your files.

[send.sgraph.ai](https://send.sgraph.ai) | Currently in private beta

---

## How It Works

1. **You select a file** in your browser and enter an access token
2. **Your browser encrypts the file** using AES-256-GCM (Web Crypto API) — encryption happens entirely on your device
3. **Only the encrypted ciphertext** is uploaded to the server — the decryption key never leaves your browser
4. **You share two things separately:** the download link and the decryption key, through different channels
5. **The recipient opens the link,** enters the key, and the file is decrypted in their browser
6. **A transparency panel** shows exactly what the server stored and what it did not

The server holds only encrypted bytes and anonymised metadata. No file names. No decryption keys. No plaintext. Ever.

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
