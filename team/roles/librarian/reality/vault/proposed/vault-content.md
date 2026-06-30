# vault/proposed — Vault Content & AI

**Domain:** `vault/` | **Last updated:** 2026-06-30 | **Maintained by:** Librarian
**Source:** briefs 05/25 (doc 493), 06/02–06/03

---

## Talk to the Vault — Vault Chat with Tool-Calling (05/25 brief — doc 493)

**PROPOSED — does not exist yet.**

Architecture dev pack (12 documents, code-grounded against real `__Send` code):
`library/sgraph-send/dev_packs/v0.27.80__vault-chat/`

Builds on EXISTING: `<app-shell>` + `window.sg` VFS bridge (`app-shell.js`); `vault-generate` LLM-over-`data-llm-bus`; vault file-ops/commit/sync (`sg-vault--file-ops.js`, `sg-vault--folder-ops.js`, `sg-vault-commit.js`, `sg-vault--sync.js`); `sg-agentic-loop`, `sg-tool-runner`, `sg-tool-definition`, `sg-llm-*` from `dev.tools.sgraph.ai` (REUSE unchanged).

**Key decisions settled (dev pack README §3):**
- D1: Everything-in-iframe topology (chat UI, execution center, budget, key usage all in the chat iframe)
- D4: OpenRouter key at `/.vault/secrets/openrouter.key`; injected by parent at boot; never readable by the iframe VFS
- D5: `ephemeral` (memory-only, commit-free) as default persistence; `snapshot` and `synced` opt-in
- D6: `run_code` not registered in Track A

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-248 | **Talk to the vault (vault chat, Track A substrate)** | Chat window inside the vault UI (new Vault App at `en-gb/vault/chat/`); vault-aware (reads vault files as context); tool-calling with visible execution via `sg-agentic-loop` + `sg-tool-runner`; read-write to the self-contained vault (write coalesced by `VaultFlushController` into one commit per turn); infographic generation + file modify/add/abstract; right-pane UI; OpenRouter key stored at `/.vault/secrets/openrouter.key` (parent injects at iframe-boot; `/.vault/**` excluded from iframe VFS). VFS bridge extended with batch-commit method. Tool policy/budget governor wraps the agentic loop. | doc 493 + dev pack v0.27.80 docs 02, 03, 04, 05, 08, 10, 12 |
| P-249 | **Talk to the vault (vault chat, Track B cognition)** | Sidecars (parallel background LLM processes), multi-LLM consensus (primary + validator), semantic knowledge graph (facts/hypotheses/evidence persisted in vault). Built after Track A substrate is working. | dev pack v0.27.80 doc 06, 10 |
