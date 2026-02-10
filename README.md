# SGraph Send

Privacy-first file sharing with zero-knowledge encryption at [send.sgraph.ai](https://send.sgraph.ai).

## What is this?

SGraph Send is a file sharing service where the server never sees your files. Files are encrypted in your browser using AES-256-GCM before upload. The decryption key never leaves your device and is never sent to the server. The server only stores encrypted ciphertext.

## How it works

1. **Sender** selects a file and enters an access token
2. **Browser** generates an AES-256-GCM encryption key and encrypts the file locally
3. **Encrypted file** is uploaded to the server (the server never sees the plaintext)
4. **Sender** shares the download link via one channel and the decryption key via another
5. **Receiver** opens the link, enters the key, and the file is decrypted in their browser
6. **Transparency panel** shows exactly what data was captured and what was not

The server stores only encrypted bytes, anonymised metadata, and one-way IP hashes. No file names, no decryption keys, no plaintext.

## Architecture

- **Two Lambda functions** — public (transfers, health, static UI) and admin (tokens, stats)
- **Lambda URL Functions** — direct HTTPS endpoints, no API Gateway
- **FastAPI + Mangum** via [OSBot-Fast-API](https://github.com/owasp-sbot/OSBot-Fast-API) route classes
- **Memory-FS** storage abstraction — in-memory (tests), local disk (dev), S3 (production)
- **Type_Safe** schemas from [osbot-utils](https://github.com/owasp-sbot/OSBot-Utils) (no Pydantic)
- **Web Crypto API** — AES-256-GCM encryption/decryption in the browser
- **IFD Web Components** — vanilla JS frontend, zero framework dependencies
- **Three UIs** — user workflow, power user tools, admin console

## Project structure

```
sgraph_ai_app_send/              # Application code
  lambda__admin/                 # Admin Lambda (FastAPI + Mangum)
  lambda__user/                  # User Lambda (in progress)

sgraph_ai_app_send__ui__admin/   # Admin UI (static assets)
sgraph_ai_app_send__ui__user/    # User UI (static assets)

tests/unit/                      # Tests (no mocks, real in-memory stack)

.issues/                         # Issues FS (file-based issue tracking)
roles/                           # Role-based review documents
  architect/                     # API contracts, data models, system topology
  cartographer/                  # System landscape maps
  conductor/                     # Product owner reviews and decisions
  dev/                           # Implementation plans and code reviews
  devops/                        # Infrastructure and deployment reviews
  librarian/                     # Knowledge base, Issues FS maintenance
  qa/                            # Test strategy and security reviews
```

## Development

```bash
# Install dependencies
poetry install

# Run tests
poetry run pytest tests/unit/ -v

# List issues
poetry run issues-fs list
```

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Python 3.12 / arm64 |
| Web framework | FastAPI via OSBot-Fast-API |
| Lambda adapter | Mangum |
| Storage | Memory-FS (pluggable backends) |
| AWS operations | osbot-aws |
| Type system | Type_Safe (osbot-utils) |
| Frontend | Vanilla JS + Web Components (IFD) |
| Encryption | Web Crypto API (AES-256-GCM) |
| Testing | pytest, in-memory stack, no mocks |

## Status

**v0.1.4** — Admin Lambda infrastructure scaffolded and tested. User Lambda in progress.

## License

Apache 2.0
