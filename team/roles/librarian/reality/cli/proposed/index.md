# cli/proposed — Index

**Domain:** `cli/` | **Last updated:** 2026-04-28
**Source:** Archived monolith `../v0.16.26__what-exists-today.md` — Section 17 (lines 1556–1596), Section 6 (lines 817–903)

---

## sgit share Delta-Share Fallback (Architect review 04/17)

Fix `sgit share` HTTP 503 "DNS cache overflow" on vaults > ~4MB from egress-controlled
environments (Claude Web / claude.ai containers). Proposed: delta-share fallback that avoids
the full vault download. Status: PROPOSED.

---

## sgit CLI Extensions (03/27 — from_team__cli, v0.19.7)

| Proposed Feature | Status |
|-----------------|--------|
| Client passphrase flag (`--passphrase`) for non-interactive use | PROPOSED |
| Batch push (push multiple vaults in one command) | PROPOSED |
| `sgit upload <file>` (file transfer via CLI, not vault) | PROPOSED |
| `sgit download <transfer-id>` | PROPOSED |
| `sgit secrets store/get/list/delete` (OS keychain integration) | PROPOSED |

---

## sgit derive-keys (OQ-1 from 04/28 architect review)

Should `sgit derive-keys` output include the `structure_key` once the encryption split is
implemented? Open question — requires CLI Team + Conductor decision.

---

## MCP Transport Backend for sgit

sgit operations exposed via MCP protocol, enabling AI agents to call vault operations
as MCP tools without bash_tool access. PROPOSED.

---

## Vault Migration / Multi-Remote (03/29 — dev brief)

Pull from multiple remotes, vault migration tooling, multi-remote configuration.
PROPOSED — see also `vault/proposed/multi-remote.md`.

---

## Merge and Conflict Resolution

Architecture simulated but no code. Vault branch merges with conflict detection and
three-way merge. PROPOSED.

*Full source: `../v0.16.26__what-exists-today.md` Section 6 (lines 817–903), Section 17 (lines 1556–1596)*
