# What is SG/Send

**Product:** [send.sgraph.ai](https://send.sgraph.ai)
**Website:** [sgraph.ai](https://sgraph.ai)
**Version:** v0.19.9
**Date:** 29 March 2026

---

## In One Sentence

SG/Send is zero-knowledge encrypted file sharing with rich content viewing — your files are encrypted in your browser before upload, and recipients can browse, view, and interact with them without downloading.

---

## The Core Idea

When you share a file with SG/Send, it's encrypted in your browser using AES-256-GCM (Web Crypto API) before it ever touches the server. The decryption key never leaves your device. The server stores only encrypted ciphertext — it cannot see your files, your filenames, or your keys.

This is architectural, not policy. SG/Send **cannot** read your files. Not "will not." Cannot. The server doesn't have the key and never did.

Recipients get a link or a friendly token. They open it in their browser. The file is decrypted client-side. They can view, browse, and interact with the content — all without downloading and all without the server ever seeing the plaintext.

Zero cookies. Zero tracking. No account required for either sender or recipient.

---

## What Makes It Different

Most encrypted file sharing tools are "upload → download." The recipient gets a blob and has to figure out what to do with it. SG/Send is different in five ways:

### 1. Rich Content Viewing

Recipients don't just download — they experience the content in the browser. Markdown renders with full typography (headings, tables, code blocks, blockquotes). PDFs open in a built-in viewer with present mode (fullscreen). Images display in a gallery with type-aware thumbnails. JSON shows with structure. Code renders with formatting. All zero-knowledge, all client-side.

### 2. Folder Browsing

Drop a folder and the recipient gets a full file explorer — sg-layout provides tree navigation on the left, tabbed multi-pane content in the centre and right, with inline rendering of every file type. Files can be opened side by side, compared, resized. It's like Finder or VS Code's explorer — but zero-knowledge, in the browser.

### 3. Friendly Tokens

Instead of sharing a URL with a 64-character hex hash, users can share a human-readable token like `oral-equal-1234`. The token derives both the transfer ID and the decryption key using SHA-256 and PBKDF2. You can say it over the phone, type it from memory, or text it. 320 × 320 × 10,000 = ~1 billion combinations.

### 4. Verifiable Transparency

After upload, a transparency panel shows exactly what the server stored (encrypted ciphertext, file size) versus what it never saw (decryption key, raw IP, filenames, plaintext). Recipients see decryption timing ("Decrypted in 0.26s") confirming it happened in their browser. Open DevTools → Application → Cookies and you'll find nothing — zero cookies, verifiable.

### 5. No Account, Pay-Per-Use

No signup, no subscription, no data harvesting business model. £0.01 per file. The Starter Pack is £5 for 500 transfers. This is a trust signal as much as a pricing model — SG/Send has no incentive to harvest your data because it doesn't run on your data.

**The north-star claim no competitor can make:**

> "We cannot read your files — and you never have to download them to view them."

WeTransfer cannot say the first clause. Proton cannot say the second.

---

## Features That Exist Today

Everything below has been code-verified. If it's listed here, it works. If it's not listed, it doesn't exist yet (the project has a strict reality document policy).

### Sending Files

- **Upload:** Drag-and-drop files or folders, paste from clipboard, or use a file picker
- **Text mode:** Toggle to send text directly (encrypted the same way)
- **Multi-file:** Upload multiple files at once with smart skip for duplicates
- **Large files:** Presigned multipart upload for files up to 1 GB via S3
- **Encryption:** AES-256-GCM, Web Crypto API, happens in the browser before upload
- **SGMETA envelope:** Original filenames preserved client-side, never sent to server
- **6-step wizard:** Select → Delivery → Share → Confirm → Encrypt & Upload → Done
- **Test files:** Built-in test file component with 5 file types for trying the product

### Sharing

- **Three share modes:**
  - Combined link (URL with hash containing the key)
  - Link + key separate (for sharing through different channels)
  - Friendly token (`word-word-NNNN` — derived key, memorable, shareable verbally)
- **QR code** generation for any share mode
- **Email composition** — mode-aware: separate mode sends link only, token mode sends friendly URL
- **Copy link** with clipboard feedback

### Receiving and Viewing

- **Auto-decrypt** from URL hash — recipients click the link and content appears
- **Manual decrypt** — enter key or friendly token manually
- **Gallery view:** Grid of type-aware thumbnails (images show previews, PDFs show first page, markdown shows rendered text). Three density modes: compact, grid, large
- **Lightbox:** Click any file → full content view with keyboard navigation, Print button, Share/Copy Link
- **Browse view (sg-layout):** Full file explorer with folder tree, tabbed multi-pane layout, drag-to-resize panels, side-by-side file comparison
- **PDF viewer** with present mode (fullscreen via button or 'f' key)
- **Markdown rendering** with full typography
- **Print support:** SgPrint produces branded A4 output with SG/Send header, DM Sans typography, styled tables/code/blockquotes
- **Save options:** Individual files, entire archive, or print-to-PDF

### Tokens and Access Control

- **Access tokens** gate uploads — created via Admin API
- **Token lifecycle:** Create, revoke, reactivate, update limits
- **Friendly token validation:** `check-token` (no usage consumed) and `validate-token` (consumes one use)
- **Starter Pack:** £5 via Stripe → 500 transfer token delivered via encrypted SG/Send transfer (the token is delivered using the product itself)
- **Early Access:** Free signup, no payment required

### Encrypted Vaults

Persistent encrypted storage — not just one-off transfers, but a living encrypted filesystem.

- **Create vault** with RSA-4096 + AES-256-GCM hybrid encryption
- **Folder structure:** Create folders, navigate tree, sort columns
- **File operations:** Upload, download, delete, preview
- **Vault Pointer model:** Server stores encrypted blobs addressed by vault_id/file_id. Reads are public (data is useless ciphertext without the key). Writes require access token + write_key
- **Presigned uploads** for large vault blobs (multipart via S3)
- **ACL:** Owner/editor/viewer hierarchy with share/unshare

### Data Rooms

Shared encrypted workspaces for teams.

- **Create rooms** with shared AES symmetric key
- **Member management:** Add, remove, list members
- **Invite system:** Generate invite codes with usage limits, validate, accept, expire
- **Room sessions:** 24-hour expiry, revocable
- **Audit trail:** Append-only, hash-chained event log per room
- **File browser:** Upload, download, delete, rename within room

### sgit CLI

A git-compatible encrypted CLI for vault operations. Install: `pip install sgit-ai`

- **Core:** `clone`, `pull`, `push`, `status`, `init`, `commit`, `remote add`
- **Extended:** `log`, `diff`, `branch`, `switch`, `share`, `export`
- **PKI:** `keygen`, `sign`, `verify`, `encrypt`, `decrypt`, `contacts`
- **Inspection:** `inspect`, `cat-object`, `fsck`, `uninit`
- **Works from Claude's sandbox** when `send.sgraph.ai` or `dev.send.sgraph.ai` is on the domain allowlist

### MCP (Model Context Protocol)

Stateless HTTP transport on both Lambda functions — AI agents can interact with SG/Send programmatically.

- **User Lambda MCP tools:** All transfer, presigned, and vault endpoints (including read-base64 for AI-safe binary access)
- **Admin Lambda MCP tools:** Token, key, vault, user endpoints
- **Verified:** Claude.ai generated a PDF, encrypted it, uploaded via MCP, and a human decrypted it in the browser (Milestone M-007)

### Workspace (v0.1.0)

An LLM-powered document transformation tool built on vaults.

- **Five-zone layout:** Header, nav, vault panel, main+chat, debug
- **LLM integration:** OpenRouter and Ollama (local) providers, streaming, prompt library
- **Document pipeline:** Vault → decrypt → source viewer → LLM transform → encrypt → save back to vault
- **Key property:** No LLM traffic touches the SG/Send server. Decrypted content goes browser → provider directly. Zero-knowledge maintained throughout.

---

## Security Properties

All verified in code:

- Server never sees plaintext — encryption happens in browser (AES-256-GCM)
- No filenames on server — SGMETA envelope stays client-side
- No decryption keys on server — key stays in URL hash fragment, never sent in HTTP requests
- IP addresses hashed — SHA-256 with daily rotating salt, stored as `ip_hash`
- Token-gated uploads — header or query param authentication
- Immutable audit trail — append-only, hash-chained events
- Vault ACL enforcement — owner/editor/viewer hierarchy
- Room session tokens — 24-hour expiry, revocable
- Vault reads are public (encrypted ciphertext — useless without the key)
- Vault writes are double-gated (access token + write_key match required)

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Python 3.12 / arm64 |
| Web framework | FastAPI via osbot-fast-api-serverless |
| Lambda adapter | Mangum |
| Storage | Memory-FS (pluggable: memory, disk, S3) |
| AWS operations | osbot-aws (never boto3 directly) |
| Type system | Type_Safe from osbot-utils (never Pydantic) |
| Frontend | Vanilla JS + Web Components (zero framework dependencies) |
| Encryption | Web Crypto API (AES-256-GCM, RSA-4096) — client-side only |
| Testing | pytest, in-memory stack, ~602 tests, no mocks, no patches |
| CI/CD | GitHub Actions → test → tag → deploy |

### Infrastructure

- **Two Lambda functions** — User (public, 34 API endpoints) and Admin (auth-protected, 51 API endpoints)
- **Lambda URL functions** — direct HTTPS, no API Gateway
- **Three stages each** — dev, qa, prod (6 Lambda functions total)
- **Storage auto-detection** — Memory-FS in dev/test (~100ms startup), S3 in production
- **17 i18n locales** — pre-rendered at build time, zero runtime translation cost

---

## How It's Built

SG/Send is built entirely by an 18-agent AI team operating under a single human architect (Dinis Cruz). Each agent owns a specific domain:

- **Conductor** — orchestrates workflow, routes tasks, resolves blockers
- **Architect** — system design, API contracts, technical decisions
- **Dev** — implementation, code reviews, bug fixes
- **QA** — test strategy, security testing
- **AppSec** — zero-knowledge guarantee, encryption verification
- **Designer** — UI design, brand identity
- **Sherpa** — user experience, onboarding, friction
- **Ambassador** — growth, competitive intelligence, market positioning
- **Librarian** — reality document, knowledge index, what exists vs what's proposed
- **Cartographer** — Wardley Maps, strategic positioning
- **Journalist** — content, communications
- **Historian** — decision tracking
- **DevOps** — infrastructure, deployment
- **CISO, DPO, GRC** — security governance, data protection, compliance
- **Alchemist** — investor materials, business strategy

Three teams operate in parallel: **Explorer** (new features, Genesis → Custom-Built), **Villager** (stabilise, harden, deploy to production), and **Town Planner** (investor materials, business strategy).

The agents use SG/Send's own encrypted vaults as the collaboration channel — patches are generated, pushed to vaults, pulled by the human, reviewed, and merged. The product builds itself using itself.

---

## Key Milestones

| Date | Milestone |
|------|-----------|
| 4 Mar 2026 | First cross-browser vault-workspace integration (M-009) |
| 4 Mar 2026 | First CLI vault clone — `sg-send-cli clone/status/pull` (M-010) |
| 10 Mar 2026 | First vault round-trip between Claude and human (M-011) |
| 10 Mar 2026 | Self-bootstrapping AI session — Claude read SKILL.md from vault and operated autonomously (M-012) |
| 10 Mar 2026 | Vault init from CLI — full lifecycle complete (M-013) |
| 14 Mar 2026 | IFD overlay deployment pipeline verified end-to-end (M-014) |
| 22 Mar 2026 | v0.3.0 UI refactoring complete — monolith decomposed into modular architecture |
| 27 Mar 2026 | 66 QA issues triaged, 17 fixes shipped for v0.3.0 release |
| 28 Mar 2026 | Vault presigned endpoints shipped for large blob support |

---

## Links

| Resource | URL |
|----------|-----|
| Live product | [send.sgraph.ai](https://send.sgraph.ai) |
| Website | [sgraph.ai](https://sgraph.ai) |
| GitHub repo | [github.com/the-cyber-boardroom/SGraph-AI__App__Send](https://github.com/the-cyber-boardroom/SGraph-AI__App__Send) |
| sgit CLI (PyPI) | `pip install sgit-ai` |
| sgit CLI (GitHub) | [github.com/SGit-AI/SGit-AI__CLI](https://github.com/SGit-AI/SGit-AI__CLI) |
| Early Access | [sgraph.ai/early-access](https://sgraph.ai/early-access/) |
| Contact | sherpa@sgraph.ai |

---

*Generated by the Ambassador agent — SGraph Send team — v0.19.9 — 29 March 2026*
*Grounded in the reality document (v0.19.7 audit, 28 March 2026). Everything listed here is code-verified.*
