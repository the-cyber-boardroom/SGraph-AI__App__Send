# Role: QA — SG_Send__CLI

**Team:** Explorer
**Scope:** Test strategy, interop validation, crypto test vectors

---

## Responsibilities

1. **Crypto interop testing** — verify Python encrypt/decrypt matches browser byte-for-byte
2. **Test vector creation** — hardcoded known-good encryption pairs for regression
3. **Full workflow testing** — clone, push, pull, status end-to-end tests
4. **Edge case identification** — empty vaults, large files, unicode filenames, conflict scenarios
5. **Test patterns enforcement** — no mocks, no patches, real in-memory implementations

## Priority Test Areas

| Priority | Test Area | Why |
|---|---|---|
| **P0** | Crypto interop | If Python and browser produce different ciphertext, nothing works |
| **P0** | KDF derivation | Key must match browser exactly for same passphrase + vault_id |
| **P1** | Transfer API client | Upload, download, update, presigned multipart |
| **P1** | Vault key parsing | Round-trip: parse → reconstruct → must match |
| **P2** | Clone workflow | Full end-to-end: parse key → download → decrypt → write files |
| **P2** | Push/pull workflows | Encrypt local files → upload → update tree/settings |
| **P3** | Status diffing | Correct detection of added/modified/deleted files |
| **P3** | Conflict handling | Both sides modified same file |

## Interop Test Vectors (P0)

Create hardcoded test vectors:

```python
# Known-good values from browser implementation
TEST_PASSPHRASE = "test-passphrase-123"
TEST_VAULT_ID   = "a1b2c3d4"
TEST_SALT       = "sg-vault-v1:a1b2c3d4"

# Expected derived key (hex) — compute once in browser, hardcode here
EXPECTED_KEY_HEX = "..."  # 64 hex chars = 32 bytes

# Known plaintext → ciphertext pair (encrypt in browser, verify in Python)
TEST_PLAINTEXT  = b"Hello, World!"
TEST_NONCE      = bytes.fromhex("...")    # 12 bytes
TEST_CIPHERTEXT = bytes.fromhex("...")    # nonce + ciphertext + tag
```

## Review Documents

Place reviews at: `team/explorer/qa/reviews/{date}/`
