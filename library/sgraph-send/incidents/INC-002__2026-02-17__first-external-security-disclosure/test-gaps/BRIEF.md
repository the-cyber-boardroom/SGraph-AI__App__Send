# Test Gaps Identified by Security Review

**Priority:** P3-P6 (varies by gap)
**Status:** Open

---

## Gaps

| Gap | Our Priority | Owner |
|-----|-------------|-------|
| No test verifies plaintext never reaches server | **P3** — critical for zero-knowledge claim | QA |
| Tests use literal strings, not real ciphertext | P4 | QA |
| No Playwright E2E for encryption round-trip | P4 | QA |
| No auth edge cases (expired/revoked/exhausted tokens) | P4 | QA |
| No concurrent request tests | P4 | QA |
| No CORS verification tests | P5 | QA |
| No framework behaviour tests (error format, input validation) | P6 | QA |
| No S3 integration tests (LocalStack) | P6 | QA |

## What Does Success Look Like?

1. A test that proves the server never receives plaintext — the most important test for a zero-knowledge product
2. E2E test that encrypts in browser, uploads, downloads, decrypts — full round-trip
3. Auth edge case tests covering expired, revoked, and exhausted tokens
4. Concurrent request tests proving token limits hold under parallel load
5. CORS tests verifying cross-origin policy is correct

## Approach

The P3 test (plaintext never reaches server) should be written immediately as part of Wave 1. P4 tests accompany their respective fixes. P5-P6 tests are backlog.
