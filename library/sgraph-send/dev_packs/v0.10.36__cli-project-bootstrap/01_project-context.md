# Project Context

**Version:** v0.10.36

---

## What is SG/Send?

SG/Send is a zero-knowledge encrypted file sharing platform at [send.sgraph.ai](https://send.sgraph.ai). Files are encrypted in the browser using AES-256-GCM (Web Crypto API) before upload. The decryption key never leaves the sender's device. The server only stores encrypted ciphertext — it cannot decrypt anything.

## What is a Vault?

A vault is an encrypted folder structure built on top of SG/Send's Transfer API. The server sees only unrelated encrypted blobs with hex IDs — it has no concept of vaults, folders, or file names.

**Vault structure (all encrypted, stored as transfers):**
- **Settings transfer:** Vault metadata (name, ID, created date, tree pointer)
- **Tree transfer:** Folder/file hierarchy with transfer ID references for each file
- **File transfers:** One transfer per file, each independently encrypted

**Vault key format:** `{passphrase}:{vault_id}:{settings_transfer_id}`

The passphrase and vault_id are used to derive the AES-256 encryption key via PBKDF2. The settings_transfer_id tells the client where to find the vault's settings (which contains the tree pointer, which contains all file pointers).

## How the Transfer API Works

| Operation | HTTP Method | Endpoint | Auth |
|---|---|---|---|
| Create transfer | POST | `/api/transfers/create` | Yes (access token) |
| Upload data | POST | `/api/transfers/upload/{id}` | Yes |
| Update data | POST | `/api/transfers/update/{id}` | Yes |
| Complete transfer | POST | `/api/transfers/complete/{id}` | Yes |
| Download data | GET | `/api/transfers/download/{id}` | No |
| Get info | GET | `/api/transfers/info/{id}` | No |

**Auth token:** Header `x-sgraph-send-access-token` or query parameter `access_token`.

**Transfer lifecycle:** `create` → `upload` → `complete` → (downloadable). Completed transfers can be updated in-place via the `update` endpoint (payload replaced, same transfer_id).

**Presigned multipart upload (>6MB):**
1. `POST /api/presigned/initiate` → get presigned S3 URLs
2. `PUT` each part directly to S3
3. `POST /api/presigned/complete` → finalise

## What the CLI Does

The CLI (`sg-send-cli`) provides git-inspired commands to sync a local folder with a remote vault:

```bash
sg-send-cli clone "mypass:abc123:def456" ~/vaults/project
sg-send-cli status
sg-send-cli push
sg-send-cli pull
sg-send-cli ls /documents
sg-send-cli info
```

A `.sg_vault/` directory (like `.git/`) tracks vault state locally:
```
.sg_vault/
├── config         # INI — vault_id, remote endpoint, auth
├── HEAD           # Vault key (passphrase:vault_id:settings_transfer_id)
├── index.json     # File tracking manifest (local hash, remote transfer_id, sync state)
└── FETCH_HEAD     # Last known remote tree (cached)
```

## Encryption Parameters (MUST Match Browser Exactly)

| Parameter | Value |
|---|---|
| Algorithm | AES-256-GCM |
| Key size | 256 bits (32 bytes) |
| Nonce (IV) | 12 bytes, random per encryption |
| Auth tag | 16 bytes (appended by GCM) |
| KDF | PBKDF2-HMAC-SHA256 |
| KDF iterations | 600,000 |
| KDF salt | `sg-vault-v1:{vault_id}` (UTF-8 encoded) |
| Wire format | `[12 bytes nonce][ciphertext + 16 bytes tag]` |
| AAD | None |

**The first test must be:** Encrypt in Python → decrypt in JavaScript (and vice versa). If this fails, everything stops.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Python 3.12 |
| CLI framework | Typer (class-based, `Typer__Routes` pattern) |
| HTTP client | httpx (async-capable, streaming) |
| Encryption | `cryptography` (pyca) — AESGCM + PBKDF2HMAC |
| Type system | Type_Safe from osbot-utils (NEVER Pydantic) |
| Testing | pytest (no mocks, no patches) |
| Build | Poetry |
| CI/CD | GitHub Actions → PyPI (OIDC) |
