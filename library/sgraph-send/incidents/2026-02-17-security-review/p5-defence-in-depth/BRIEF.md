# P5 Group: Defence-in-Depth

**Severity:** P5 — Fix when convenient
**Findings:** #6, #7, #8, #13, #15, #23
**Status:** Open

---

## Findings

### #6 — Sender IP Hardcoded to Empty String

**Location:** `Routes__Transfers.py:71`
**Context:** Audit trail broken. Code has IP capture infrastructure (hash function exists) but hardcodes IP to empty string. The DPO position is "no IP addresses" — this is accidentally enforced via a TODO. Needs a deliberate decision (see Step 6 in daily brief).
**Dependency:** Blocked on IP address decision (#14 in master tasks).

### #7 — IP Hash Unsalted (README Claims Daily Salt)

**Location:** `Transfer__Service.py:134-137`
**Context:** README claims "SHA-256 with daily rotating salt" — no salt exists. Compound dependency on #6. The primary concern is documentation accuracy.
**Immediate action:** GRC to fix README regardless of #6 decision.

### #8 — S3 Bucket Missing Public Access Block

**Location:** `Storage_FS__S3.py:25`
**Fix:** Add `put_public_access_block()` call
**Context:** AWS defaults since April 2023 mitigate this. Defence-in-depth.

### #13 — No Rate Limiting on Any Endpoint

**Location:** All routes
**Fix:** Add `slowapi` or Lambda concurrency limit
**Context:** Lambda provides partial natural throttle. This is a cost risk (Lambda billing), not a data risk.

### #15 — All Dependencies Use Wildcard `"*"` Versions

**Location:** `pyproject.toml:13-17`
**Fix:** Constrain to specific major versions
**Context:** `poetry.lock` mitigates for reproducible builds. Risk is `poetry update` without review.

### #23 — Race Condition on Upload/Complete

**Location:** `Transfer__Service.py:66-77`
**Context:** Latent with in-memory storage; exploitable when we move to S3 backend. Same TOCTOU pattern as #1.
**Dependency:** Fix alongside #1 (P3 token race condition).

---

## Roles

| Role | Findings | Responsibility |
|------|----------|---------------|
| DPO + AppSec + Sherpa | #6, #7 | IP address decision |
| GRC | #7 | Fix README immediately |
| DevOps | #8 | S3 public access block |
| Architect | #13, #23 | Rate limiting research, race condition architecture |
| Developer | #8, #15, #23 | Implementation |
