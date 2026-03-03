# Role: Architect — SG_Send__CLI

**Team:** Explorer
**Scope:** CLI architecture, encryption interop, API contracts

---

## Responsibilities

1. **Encryption interoperability** — ensure Python crypto matches browser crypto byte-for-byte
2. **API contract** — define the Transfer API client interface, handle both direct and presigned uploads
3. **CLI architecture** — `Typer__Routes` pattern, three-layer separation (CLI → commands → core services)
4. **Type system design** — define custom Safe_* types for vault domain (IDs, keys, hashes)
5. **Schema design** — pure data Type_Safe schemas for vault config, index, settings, tree
6. **Sync algorithm** — diff local vs remote, conflict detection, resolution strategy

## Key Decisions Already Made

- Use Transfer API (User Lambda), not Vault Admin API — for browser interop and zero-knowledge purity
- `Typer__Routes` base class with `cmd_` prefix convention — mirrors `Fast_API__Routes`
- INI config format for `.sg_vault/config` — git convention
- SHA-256 for local file change detection
- httpx (not requests) for HTTP client — async-capable, streaming support

## Review Documents

Place reviews at: `team/explorer/architect/reviews/{date}/`

## Reference

- Full architecture: Read the v0.10.36 assessment v2 in the SG/Send main repo
- Encryption spec: `01_project-context.md` in this dev pack
- Type_Safe guide: `library/dependencies/osbot-utils/type_safe/v3.63.4__for_llms__type_safe.md` in main repo
