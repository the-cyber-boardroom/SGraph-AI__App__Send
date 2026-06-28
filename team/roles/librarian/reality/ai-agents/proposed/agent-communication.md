# AI Agents — Proposed: Agent Communication, MCP, and Security Tools

**Domain:** ai-agents/proposed/agent-communication | **Last updated:** 2026-06-28 | **Maintained by:** Librarian (B-003)
**Parent index:** [`index.md`](index.md)

All items below are PROPOSED. None have been code-verified. Do not describe any of these as existing features.

---

## MCP Gaps (DOES NOT EXIST)

| Feature | Status |
|---------|--------|
| MCP `secrets_create` tool | DOES NOT EXIST — listed as gap |
| MCP `secrets_status` tool | DOES NOT EXIST — listed as gap |
| MCP `rooms_create` tool | DOES NOT EXIST — rooms API exists but not MCP-exposed |
| MCP `rooms_add_user` tool | DOES NOT EXIST |
| MCP `rooms_revoke_user` tool | DOES NOT EXIST |
| MCP transport backend for sgit | DOES NOT EXIST |

## sgit CLI Extensions (Proposed)

| Feature | One-Line Description | Monolith Section |
|---------|---------------------|-----------------|
| `sgit-ai sync <remote>` | Pull + push in one operation for multi-remote vaults | Section 19 |
| `sgit-ai dump --local / --remote` | Vault state diagnostics tool | Section 16 |
| `sgit-ai diff-state` | Local vs server comparison | Section 16 |
| `sgit share --auto` | Auto-refresh share token on every push | Section 18 |
| `.sgitignore` support | Pattern-based exclusion from vault commits | Section 16 |
| `.keep` files for empty directories | Git-compatible empty directory handling | Section 16 |

---

## Communication Vault Pattern (05/11 brief — doc 362)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Communication vault template | Structured vault: initial prompt + SKILL.md + messages folder for agent-to-agent messaging | doc 362 |
| Email-FS-light bidirectional protocol | Standardised bidirectional agent-to-agent message format in vault | doc 362 |
| Per-agent protocol pages | Audience-specific agent pages (Lovable, Claude Code, Cursor, ChatGPT) | doc 362 |

---

## QA Stack on SG/Compute (05/12 brief — doc 374)

| Feature | One-Line Description | Source |
|---------|---------------------|--------|
| Vault-driven QA control surface (SG/App) | Test definition, execution, results — all stored in vault | doc 374 |
| iframe injection test runner | Fast in-process tests for our own pages | doc 374 |
| Playwright integration | Real browser automation for any site | doc 374 |
| Scheduling layer (cron-equivalent) | Run tests on intervals; requires SG/Compute cron support | doc 374 |

---

## AppSec Mini-Tools (05/16 briefs — doc 423)

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-159 | Threat-modelling mini-tool on vaults | StrideGPT (mrwadams) integration; STRIDE + OWASP LLM Top 10 + MAESTRO pattern detection | doc 423 |
| P-160 | Client-side mode: threat modeller in browser | Runs entirely in vault JS API context; no server-side compute; offline-capable | doc 423 |
| P-161 | Ephemeral compute-backed mode | FastAPI backend on SG/Compute; Fargate task per session; heavier analysis possible | doc 423 |
| P-162 | AppSec vault schema for threat artefacts | System descriptions, threat lists, attack trees, mitigations, evidence — all in vault | doc 423 |
| P-163 | SBOM analysis mini-tool (planned next) | syft/cdxgen integration; vault holds SBOM + change history; planned after threat modelling | doc 423 |
| P-164 | Dependency scanning mini-tool (planned next) | trivy/grype integration; vault tracks findings and fixes; planned after threat modelling | doc 423 |

---

## Vault Communications Demo + PKI (06/03 briefs)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-312 | Three-Agent Comms Demo Vault | Browser harness proving vault-to-vault messaging: 3 agents each with iframe inboxes; internal JS API (ping, send, receive, markReceived); step-by-step validation harness; manual round-trip proof first, then agentic via OpenRouter; key design principle: agents only share what they explicitly message (no full vault access); scale path 3 → 5 → 100s → 1000s; accountant experiment as first real use case. Depends on vault inbox (NOW EXISTS). | 06/03 dev-brief |
| P-315 | Skills Library as Platform Feature | A vault holding skills from multiple sources (Tessl, Anthropic, Pi, platform own). Library management: provenance tracking, sync from source, applicability scoring, evidence (screenshots, test results). Sharp insight: how-to-deploy-and-run knowledge fills a real gap (Claude couldn't run an Anthropic legal skill from a URL alone — deployment context was missing). Differentiator: talk-to-skill (on-demand vault instance), per-skill budgets, per-skill billing. Foundation for skills marketplace (P-297). | 06/03 strategy-brief |
| P-316 | SG/Vault as Platform of Primitives — Positioning | SG/Vault is a hyperscaler for shared state, not a category product. Dissolves the protocol/harness/workflow question by sitting beneath all three (noun, not verbs). Three-layer model: bottom (vault primitives), middle (heterogeneous agents/workflows/manual), top (bespoke UX). Two views: invisible-vault (users never see it) and builder-platform (developers see the structure). Restrict-to-unleash flywheel (tight primitive scope → safe, wide autonomy for builders). Superpower: builders are users of the same platform (tight feedback loop, features driven by real use). | 06/03 strategy-brief |
