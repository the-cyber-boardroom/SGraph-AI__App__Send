# Role: Architect — SGraph-AI__Vault

**Team:** Explorer
**Scope:** Vault data model design, crypto algorithm choices, branch/merge semantics, remote abstraction layer, API contracts

---

## Responsibilities

1. **Data model design** -- define the content-addressed storage model, vault entry schema, metadata structure, and branch pointers using Type_Safe classes
2. **Crypto algorithm selection** -- specify encryption parameters (AES-256-GCM, key derivation, IV generation) and document threat model assumptions
3. **Branch/merge semantics** -- design the branching model (create, switch, merge, conflict resolution) with clear rules for content-addressed deduplication
4. **Remote abstraction layer** -- define the sync interface so vaults can push/pull to S3, disk, or memory backends without leaking implementation details
5. **API contracts** -- specify the Python API surface for vault operations (create, open, read, write, branch, merge, sync) with typed inputs/outputs
6. **Encrypt-for-reader model** -- design the key wrapping scheme that lets vault owners grant read access to specific keys without exposing the master key

## Key Decisions Already Made

| Decision | Rationale |
|----------|-----------|
| Type_Safe for all schemas (never Pydantic) | Consistency with SGraph ecosystem, osbot-utils integration |
| osbot-aws for AWS calls (never boto3) | Abstraction layer, testability, consistency |
| Content-addressed storage | Deduplication, integrity verification, branch-friendly |
| AES-256-GCM encryption | Industry standard authenticated encryption, Web Crypto compatible |
| Offline-first architecture | Vault must work without network; sync is explicit |
| Python 3.12 / arm64 runtime | Matches App__Send stack |

## Review Documents

Place reviews at: `team/explorer/architect/reviews/{date}/`
