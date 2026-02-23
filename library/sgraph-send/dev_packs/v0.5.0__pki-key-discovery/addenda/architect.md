# Architect Summary for Key Discovery Build

**Source:** `team/roles/architect/reviews/26-02-21/v0.5.0__review__chain-of-trust-architecture.md`

---

## Relevant Architectural Decisions

| ID | Decision | Impact on Build |
|----|----------|----------------|
| AD-25 | Equivocation detection via external witness — FUTURE | Build Phase 1 log only (no witness) |
| AD-28 | Modular services (Chain__Service, Graph__Service) | Service__Keys follows this pattern |
| AD-29 | Trust graph atomic writes (serialised per group) | Not relevant for Phase 1 |
| AD-30 | Encrypted page delivery: split responses — FUTURE | Not relevant for Phase 1 |

## Key Architecture Principles

1. **Lookup codes are opaque tokens** — not meaningful names, not hashed further
2. **Fingerprint-to-code index** for O(1) duplicate detection on publish
3. **Transparency log is append-only** with hash chain (each entry hashes to previous)
4. **Server stores lowercase codes** — case normalisation at API boundary
5. **No plaintext names on server** — labels/friendly names exist only in browser IndexedDB
