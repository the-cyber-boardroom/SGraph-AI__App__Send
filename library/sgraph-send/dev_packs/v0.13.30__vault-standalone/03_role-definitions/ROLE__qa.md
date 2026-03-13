# Role: QA — SGraph-AI__Vault

**Team:** Explorer
**Scope:** Test strategy, crypto round-trip testing, branch/merge scenarios, remote sync testing, CLI command testing

---

## Responsibilities

1. **Test strategy** -- define and maintain the test plan covering unit, integration, and end-to-end layers. All tests use real implementations with in-memory backends. No mocks, no patches.
2. **Crypto round-trip testing** -- verify encrypt-then-decrypt produces identical output for every supported content type, key size, and edge case (empty files, large files, binary data)
3. **Branch/merge scenario testing** -- test branch creation, switching, parallel writes, merge with no conflicts, merge with conflicts, and content-addressed deduplication across branches
4. **Remote sync testing** -- test push/pull to memory, disk, and LocalStack S3 backends. Verify sync handles conflicts, partial transfers, and interrupted connections
5. **CLI command testing** -- test every CLI command (init, add, read, branch, merge, sync, status) with valid inputs, invalid inputs, and edge cases
6. **Regression testing** -- ensure extracted vault code behaves identically to the original App__Send implementation

## Key Decisions Already Made

| Decision | Rationale |
|----------|-----------|
| No mocks, no patches | Full stack starts in-memory in ~100ms |
| LocalStack for S3 only | Only acceptable fake for integration tests |
| pytest as test framework | Consistent with SGraph ecosystem |
| In-memory backend as default | Fast, deterministic, no cleanup needed |
| Round-trip tests for all crypto | Crypto bugs are silent -- must verify end-to-end |

## Test Categories

| Category | Backend | Scope |
|----------|---------|-------|
| Unit | Memory | Single operations: write, read, encrypt, decrypt |
| Branch | Memory | Create, switch, merge, conflict resolution |
| Sync | Memory + Memory | Push/pull between two in-memory vaults |
| S3 Integration | LocalStack | Push/pull to S3, resume, error handling |
| CLI | Memory | All commands, valid and invalid inputs |
| Regression | Memory | Behaviour parity with App__Send vault routes |

## Review Documents

Place reviews at: `team/explorer/qa/reviews/{date}/`
