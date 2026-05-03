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

---

## SGit Four-Layer Refactoring (04/29 Villager brief, doc 336)

All items below are PROPOSED — does not exist yet. Source: `briefs/04/29/v0.22.19__villager-brief__sgit-code-refactoring-four-layers.md`

**Why:** PKI is the next major SGit feature. Clean layer separation makes PKI additions surgical (Crypto for signing/verification, Core for sign/verify steps, Network for key exchange). Without this refactoring, PKI will touch everything and regression risk is high.

### Four-Layer Architecture

| Layer | Folder | Contents | Dependency Rule |
|-------|--------|----------|----------------|
| Crypto (1) | `crypto/` | PBKDF2, AES-256-GCM, hashing, future PKI ops | No dependencies on other layers (pure functions) |
| Core (2) | `core/actions/` | Every state-changing operation: commit, push, pull, init, branch, merge | Depends on Crypto; does NOT depend on Network or Plugins |
| Network (3) | `network/` | All API calls to SG/Send server (upload, download, auth) | Depends on Crypto; mockable for offline testing |
| Plugins (4) | `plugins/` | Read-only operations: list, log, status, diff, search, format | Depends on Core + Network; cannot break state |

**Architectural invariant:** No upward dependencies. Crypto never calls Core. Core never calls Plugins. Enforced by folder structure and import audit.

### Transaction Logging (Core Layer)

Every Core action produces a type-safe JSON transaction record:
```json
{ "action": "commit", "timestamp": "...", "vault_id": "...", "branch": "...",
  "parent_commit": "...", "new_commit": "...", "files_added": [...], "duration_ms": 45 }
```
Enables: replay, monitoring, audit trail, future rollback support. Distinct from vault commit history (captures failed ops and intermediate states too).

**Open Decision #30:** Transaction log storage — alongside vault data (default, simpler) or separate log store (better for aggregation)?

### Step-Based Action Decomposition

Each CLI command decomposed into discrete typed steps. Each step: typed input object → typed output object, independently testable, per-step `duration_ms` captured.

Enables performance visibility without premature optimisation: "Upload objects (Step 4) took 4.8s of the 5s push" → targeted fix.

### Feature Flags for Plugins

`config.json` enables/disables individual plugins. Disabled plugins: CLI commands not registered, code not loaded. Same pattern as ephemeral infra backend plugins.

### Open Decisions

| # | Decision | Status |
|---|----------|--------|
| 29 | SGit Crypto layer — when does it move to its own separate repo? | After stabilisation. Architect recommends: internal module first, extract after PKI ships. |
| 30 | Transaction log storage location — alongside vault data or separate? | Architect recommends: alongside vault data for MVP. |

*Full source: `briefs/04/29/v0.22.19__villager-brief__sgit-code-refactoring-four-layers.md`*
