# P4 Group: Should Fix

**Severity:** P4 — Real vulnerability, low current risk
**Findings:** #2, #3, #9, #10, #14
**Status:** Open

---

## Findings

### #2 — GitHub Actions Pinned to `@dev` (Supply Chain)

**Location:** `.github/workflows/ci-pipeline.yml:71,84,98,100`
**Fix:** Pin to specific commit SHA
**Effort:** Small — update 4 lines in YAML
**Context:** Actions are from `owasp-sbot/OSBot-GitHub-Actions` — our own OWASP project. Risk is lower than third-party, but should pin as best practice.

### #3 — No Application-Level Upload Size Enforcement

**Location:** `Routes__Transfers.py:79`
**Fix:** Current — low urgency (Lambda 6MB payload limit exists). Pre-signed URLs — research S3 size constraints.
**Effort:** Research task, not immediate code fix
**Context:** Lambda provides infrastructure-level cap today. Becomes P3 when architecture moves to pre-signed S3 URLs for direct upload.

### #9 — Decryption Key Visible in URL During Download

**Location:** `send-download.js` (all versions)
**Fix:** Clear URL hash immediately after extracting key, before network requests
**Effort:** Small — one-line fix (move existing line earlier)
**Context:** Narrow exposure window, but principle matters for a zero-knowledge app. Part of the #5/#9/#10 chain.

### #10 — No Content Security Policy on Any Page

**Location:** All HTML files
**Fix:** Move inline JS to external files, add nonce-based CSP
**Effort:** Medium — requires refactoring inline scripts
**Context:** Amplifier for #5 (localStorage plaintext). No XSS mitigation on any page. Important for a zero-knowledge app. Part of the #5/#9/#10 chain.

### #14 — Path Injection in Admin Cache Browser

**Location:** `Routes__Cache__Browser.py:26-35`
**Fix:** Validate paths, reject `../` traversal sequences
**Effort:** Small
**Context:** Requires admin API key (high precondition), but paths should be sanitised regardless.

---

## What Does Success Look Like?

1. GitHub Actions pinned to commit SHAs, not mutable branch refs
2. Upload size research document produced for pre-signed URL architecture
3. Decryption key cleared from URL hash before any network request
4. CSP deployed on all pages with nonce-based inline script handling
5. Admin cache browser rejects path traversal attempts
6. Tests exist for each fix

## Roles

| Role | Findings | Responsibility |
|------|----------|---------------|
| DevOps | #2, #3 (research) | Pin actions, research S3 size constraints |
| Developer | #9, #10, #14 | Code fixes |
| AppSec | #10, #14 | Validate CSP policy, validate path sanitisation |
| Architect | #3 | Pre-signed URL architecture research |
| QA | All | Tests for each fix |
