# admin-api — Proposed Features

**Domain:** `admin-api/` | **Last updated:** 2026-04-28
**Source:** Archived monolith `../v0.16.26__what-exists-today.md` — Section 20 (docs 211–221, lines 1845–1993), Section 21 (lines 2003–2059)

---

## Backend Storage Restructuring (doc 223, 04/04)

| Proposed Feature | Status |
|-----------------|--------|
| New Storage_FS layout with deterministic-safe paths | PROPOSED |
| Separation of vault pointer model vs. legacy vault API | PROPOSED |
| Batch read API (multiple object reads in one call) | PROPOSED |
| `/vault/health/{vault_id}` health check endpoint | PROPOSED |
| Compare-and-swap for multi-writer files | PROPOSED |
| 6 additional storage backend mappings (DynamoDB, PostgreSQL, Redis, Graph DB) | PROPOSED — concept only; only FS and S3 exist |

---

## MCP Rooms Exposure

| Proposed Feature | Status |
|-----------------|--------|
| `rooms_create` MCP tool | PROPOSED — rooms API exists, not yet MCP-exposed |
| `rooms_add_user` MCP tool | PROPOSED |
| `rooms_revoke_user` MCP tool | PROPOSED |
| `secrets_create` / `secrets_status` MCP tools | PROPOSED |

---

## Vault Bundle Endpoint (v0.13.19 architect response)

| Proposed Feature | Status |
|-----------------|--------|
| `GET /api/vault/bundle/{vault_id}/{bundle_file_id}` — single-call vault clone | PROPOSED — proof-of-knowledge auth via deterministic bundle_file_id |

---

## Billing Automation

| Proposed Feature | Status |
|-----------------|--------|
| Stripe webhook → auto-token creation | PROPOSED — manual process currently |
| Per-user vault provisioning on credit purchase | PROPOSED |

*Full source: `../v0.16.26__what-exists-today.md` Sections 6, 20, 21 (lines 796–904, 1845–2059)*
