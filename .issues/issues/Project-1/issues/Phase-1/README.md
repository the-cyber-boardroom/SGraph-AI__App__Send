# Phase-1: MVP — Core Transfer Flow

**Parent:** [Project-1](../../)
**Status:** in-progress
**Source:** [Project Brief](../../../../library/docs/_to_process/project%20-%20Secure%20Send%20Service%20brief.md)

---

## Overview

Ship the minimum viable product for SGraph Send: encrypted file transfer with token authentication, transparency panel, and admin dashboard.

**Core Principle:** The entire platform can be compromised with zero privacy impact. Files are encrypted client-side (AES-256-GCM). The server never sees plaintext content or the decryption key.

---

## Features

| Label | Title | Priority | Stories | Status |
|-------|-------|----------|---------|--------|
| [Feature-1](issues/Feature-1/) | Core Transfer Flow (Upload) | P0 | SND-1, SND-2, SND-6, SEC-1, SEC-2 | backlog |
| [Feature-2](issues/Feature-2/) | Token Management | P0 | ADM-1, ADM-3, SEC-7 | backlog |
| [Feature-3](issues/Feature-3/) | Download & Decrypt | P0 | RCV-1, RCV-5, SEC-3 | backlog |
| [Feature-4](issues/Feature-4/) | Transparency Panels | P0 | SND-4, RCV-2, SEC-6 | backlog |
| [Feature-5](issues/Feature-5/) | Status & Analytics | P1 | SND-5, ADM-2 | backlog |
| [Feature-6](issues/Feature-6/) | UI & UX Polish | P1 | SND-3, SND-7, RCV-3, ADM-4 | backlog |
| [Feature-7](issues/Feature-7/) | Security Hardening | P1 | SEC-4, SEC-5 | backlog |
| [Feature-8](issues/Feature-8/) | Infrastructure & Deployment | P0 | (deployment) | backlog |

---

## API Endpoints (MVP)

| Method | Path | Auth | Feature |
|--------|------|------|---------|
| `POST` | `/transfers` | Token | Feature-1 |
| `POST` | `/transfers/{id}/complete` | Token | Feature-1 |
| `GET` | `/transfers/{id}` | None | Feature-5 |
| `GET` | `/transfers/{id}/download` | None | Feature-3 |
| `POST` | `/tokens` | Admin | Feature-2 |
| `GET` | `/tokens` | Admin | Feature-2 |
| `DELETE` | `/tokens/{id}` | Admin | Feature-2 |

---

## Dependencies & Build Order

```
Feature-8 (Infrastructure) ──► Feature-2 (Tokens) ──► Feature-1 (Upload)
                                                         │
                                                         ▼
                                Feature-4 (Transparency) ◄──── Feature-3 (Download)
                                                         │
                                                         ▼
                                Feature-5 (Status) ──► Feature-6 (UX Polish)
                                                    ──► Feature-7 (Security)
```

Start with infrastructure and token management, then upload flow, then download, then transparency/status/polish in parallel.
