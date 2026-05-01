# Security — Reality Index

**Domain:** security/ | **Last updated:** 2026-04-28 | **Maintained by:** Librarian (daily run)

This domain covers the security properties verified in code, known violations flagged for remediation, AppSec findings, external validations, and the performance baseline. It is the authoritative record for any security-related claim about SGraph Send.

---

## EXISTS (Code-Verified)

### Core Security Properties

| Property | Implementation |
|---------|---------------|
| Server never sees plaintext | AES-256-GCM encryption in browser (Web Crypto API); ciphertext only reaches server |
| No file names on server | SGMETA envelope stays client-side; server only stores opaque ciphertext blob |
| No decryption keys on server | Key in URL hash fragment (`#key`); hash fragment never sent in HTTP requests |
| IP addresses hashed | SHA-256 with daily salt; stored as `ip_hash`; original IP never persisted |
| Token-gated uploads | Header `x-sgraph-send-access-token` or query param; checked on write paths |
| Immutable audit trail | Append-only, hash-chained events in audit service |
| Vault ACL enforcement | Owner/editor/viewer hierarchy; enforced server-side |
| Room session tokens | 24-hour expiry, revocable |
| Vault Pointer reads are public | No auth — zero-knowledge model: data is AES-256-GCM ciphertext, useless without key |
| Vault Pointer writes double-gated | Requires access token + write_key |
| Vault Pointer read-base64 size limit | Lambda response capped at 3.75MB to prevent abuse |

### Token Security

- URL sanitisation: 3 regression tests covering token leak prevention in URLs
- `send-download.js` strips leading/trailing `"'` from hash URL and entry input before lookup (prevents paste-from-JSON-editor leaks, commit `7251b59`)

### Vault ID Validation

- Human-readable IDs with hyphens accepted (e.g. `apple-river-1234`)
- Opaque random IDs also accepted
- Server-side validation updated (commits `873f1afb`, `61714798`, `2da16152`)

---

## External Validation

**Date:** 28 February 2026
**Reviewer:** External AI-assisted review (ChatGPT, conversation-based assessment)
**Subject:** CloudFront log data from `send.sgraph.ai`
**Verdict:** "Low-risk operational metadata exposure. Not a security incident."

Full details in v0.10.49 reality document (`../v0.10.49__what-exists-today.md`).

---

## Performance Baseline (Pre-CDN)

**Date:** 28 February 2026 | **Page:** `/send/v0/v0.1/v0.1.8/index.html`

| Scenario | DOMContentLoaded | Page Load | Total Finish | Slowest Resource |
|----------|-----------------|-----------|-------------|-----------------|
| Cold start (Lambda reset) | 18.49 s | 18.50 s | 19.10 s | 9.29 s (i18n.js) |
| Warming (first post-deploy) | 3.50 s | 3.68 s | 4.26 s | 3.39 s (design system CSS) |
| Warm (subsequent) | 557 ms | 599 ms | 1.10 s | 542 ms (token check API) |

Measurements should be repeated after CDN migration.

---

## Known Violations (Flagged for Remediation)

### Google Fonts (External Dependency) — PARTIALLY FIXED

**sgraph_ai__website: FIXED.** All Google Fonts references removed; fonts vendored locally.

**send.sgraph.ai UIs and tools: STILL VIOLATED.** 9 files still load from `https://fonts.googleapis.com`:

| Site | Files | Count |
|------|-------|-------|
| User UI v0.1.8 | `index.html`, `download.html`, `room.html`, `join.html` | 4 files |
| User UI v0.1.7 | `vault.html` | 1 file |
| User UI v0.1.6 | `index.html`, `download.html` | 2 files |
| SSH KeyGen tool | `index.html` | 1 file |
| Admin UI v0.1.4 | `css/sg-brand.css` (@import) | 1 file |
| **Total still violated** | | **9 files** |

### Absolute Path Navigation Links

sgraph_ai__website uses absolute paths for navigation. v0.7.6 arch brief requires all links to be relative for versioned deployments and offline packaging. Status: VIOLATED in older pages.

### CI Logic in YAML (Not Python) — PARTIALLY FIXED

Python scripts exist (`deploy_static_site.py`, `generate_i18n_pages.py`, `store_ci_artifacts.py`); workflow integration not fully confirmed.

---

## Critical Requirements Status

| Requirement | Source | Status |
|-------------|--------|--------|
| Zero external dependencies in all deployments | v0.7.6 | PARTIALLY FIXED — website fixed; 9 UI/tool files still violate |
| Relative paths only in website links/assets | v0.7.6 | VIOLATED (absolute nav links in older pages) |
| cdn.sgraph.ai for shared stable artifacts | v0.7.6 | DOES NOT EXIST |
| Python-first CI (GitHub Actions as trigger only) | v0.7.6 | PARTIALLY FIXED |

---

## PROPOSED (Not Yet Implemented)

- Visibility-first security strategy — CloudFront/S3/CloudWatch/X-Ray logging (zero code) (Section 16)
- GuardDuty, WAF, Security Hub evaluation (Section 16)
- Agent-consumable security findings (JSON in vaults) (Section 16)
- Agentic QA performance framework (Section 17)
- Four-layer security model Modes B/C/D (Mode A exists — current vault model; B/C/D are conceptual) (Section 16)
- Client-side recipient restrictions (country, timezone, browser fingerprint) (Section 16)
- `<sg-policy-editor>` and `<sg-policy-evaluator>` Web Components (Section 16)
- Browser fingerprinting for anonymous free tier identity (Section 16)
- Evidence packs + risk acceptance workflow (Section 31)
- Amazon Managed Grafana + CloudWatch monitoring (Sections 16, 17)

*Full proposed items: [proposed/index.md](proposed/index.md)*

---

## Sub-files

*Currently all content is in this index. When this file exceeds ~300 lines, sub-files will be created.*
