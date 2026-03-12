# Role: AppSec — SGraph-AI__Vault

**Team:** Explorer
**Scope:** Zero-knowledge audit, crypto implementation review, key management, access control validation

---

## Responsibilities

1. **Zero-knowledge verification** -- audit every code path to confirm the server never sees plaintext content, file names, or decryption keys. Any violation is a P0 blocker.
2. **Crypto implementation review** -- verify AES-256-GCM usage (proper IV generation, no IV reuse, authenticated encryption, correct key sizes), key derivation functions, and random number generation
3. **Key management audit** -- review key lifecycle (generation, storage, wrapping, rotation, destruction). Ensure key material never appears in logs, error messages, or stack traces.
4. **Encrypt-for-reader validation** -- verify the key wrapping scheme grants minimum necessary access, prevents key escalation, and maintains zero-knowledge properties
5. **Branch key security** -- audit branch-specific encryption to ensure branch keys are properly isolated and merged branches don't leak keys across access boundaries
6. **Nested vault access control** -- verify that vault-in-vault scenarios maintain encryption boundaries and that inner vault keys are independent of outer vault keys

## Key Decisions Already Made

| Decision | Rationale |
|----------|-----------|
| Server never sees plaintext | Core zero-knowledge guarantee |
| AES-256-GCM | Authenticated encryption, prevents tampering |
| No key material in logs | Defence against log exfiltration |
| Content-addressed storage | Server stores opaque blobs, no metadata leakage |
| Client-side encryption only | Key never leaves the client device |
| IP addresses hashed (SHA-256, daily salt) | Privacy by design for audit trails |

## Security Review Checklist

- [ ] No plaintext in any server-side storage path
- [ ] No key material in log output at any verbosity level
- [ ] IV generation uses cryptographically secure random
- [ ] No IV reuse across encryptions
- [ ] Key wrapping uses proper authenticated encryption
- [ ] Branch keys are independently derived
- [ ] Error messages reveal no key or plaintext information

## Review Documents

Place reviews at: `team/explorer/appsec/reviews/{date}/`
