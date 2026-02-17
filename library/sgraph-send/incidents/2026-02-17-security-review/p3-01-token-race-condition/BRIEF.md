# P3 #1: Token Auth Bypass via Race Condition

**Severity:** P3 — Must fix before production
**Reviewer finding #:** 1
**Reviewer severity:** P1
**Location:** `Service__Tokens.py:48-65`
**Status:** Open
**Related findings:** #23 (upload/complete race condition — latent, same pattern)

---

## What Is the Work?

Token usage tracking uses non-atomic read-modify-write operations. Concurrent Lambda invocations can read the same token usage count, both pass the limit check, and both proceed — effectively bypassing usage limits. This is a standard TOCTOU (time-of-check-time-of-use) vulnerability.

## What Does Success Look Like?

1. Token usage increment is atomic — DynamoDB `ADD` operation or S3 conditional write
2. Concurrent requests cannot bypass usage limits
3. Test exists that simulates concurrent token usage and verifies limits hold
4. The same pattern is fixed in #23 (upload/complete race) for S3 backend

## Why P3?

Auth bypass with realistic preconditions — concurrent requests are normal in Lambda. Lower urgency because current traffic is low and no sensitive data exists on the server (only encrypted bytes), but the pattern must be fixed before production. With real users and real traffic, concurrent requests are guaranteed.

## Scope

- `Service__Tokens.py` lines 48-65 — token usage read-modify-write
- Related: `Transfer__Service.py` lines 66-77 — upload/complete race (#23, currently latent with in-memory storage, exploitable with S3)
- Architecture decision needed: DynamoDB `ADD` vs S3 conditional write

## Known Constraints

- Current storage is Memory-FS (in-memory) — race condition is latent but becomes real with any distributed backend (S3, DynamoDB)
- The Architect must decide the atomic increment approach before the Developer implements
- The fix must work across all storage backends (memory, disk, S3)

## Roles

| Role | Responsibility |
|------|---------------|
| Architect | Decide atomic increment approach (DynamoDB ADD vs S3 conditional write) |
| Developer | Implement atomic token usage tracking |
| AppSec | Validate race condition is eliminated |
| QA | Write concurrent request tests |
