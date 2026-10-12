# vault/proposed — Index (Table of Contents)

**Domain:** `vault/` | **Last updated:** 2026-08-11 | **Maintained by:** Librarian
**Restructured:** 2026-06-30 (B-001 — split from 244-line monolith into topic files)

---

## Active Proposals (Sub-files exist)

| File | Topic | Priority |
|------|-------|----------|
| [structure-key-split.md](structure-key-split.md) | Activate `structure_key` for structural objects — four-team change, design decided | **HIGH — active** |

---

## Topic Files

| File | Topic | Key P-numbers |
|------|-------|--------------|
| [vault-architecture.md](vault-architecture.md) | Architecture overhaul, PKI modes 2–4, multi-remote, collaboration, simple-token future items | (monolith-sourced, no P-numbers) |
| [vault-platform.md](vault-platform.md) | Vault Hub, publishing layer, GitHub-as-vault, manager vaults, credential manager, customer workflow primitives, operational substrate | P-302, P-307, P-311, P-313 |
| [vault-ux.md](vault-ux.md) | Vault browser UI, browser VFS, SGit Web Components, demo capabilities, testing framework | P-128–P-137 |
| [vault-sub-vaults.md](vault-sub-vaults.md) | Sub-vaults & external resources convention (link files, link cards, external-resource embeds); note: P-159–P-163, P-174 now EXISTS in ui/index.md | P-159–P-165, P-174 |
| [vault-previews.md](vault-previews.md) | Public vault previews (largely EXISTS — see ui/index.md), vault discovery & public keys, compliance artefacts | P-153–P-158, P-166–P-177, P-281–P-282, P-284 |
| [vault-content.md](vault-content.md) | Vault chat / Talk to the vault (Track A + B) | P-248–P-249 |

---

## P-Number Lookup

| P-number(s) | Topic file |
|-------------|-----------|
| P-128–P-137 | [vault-ux.md](vault-ux.md) |
| P-153–P-158 | [vault-previews.md](vault-previews.md) |
| P-159–P-165, P-174 | [vault-sub-vaults.md](vault-sub-vaults.md) |
| P-166–P-177 | [vault-previews.md](vault-previews.md) |
| P-248–P-249 | [vault-content.md](vault-content.md) |
| P-281–P-282, P-284 | [vault-previews.md](vault-previews.md) |
| P-302, P-307, P-311, P-313 | [vault-platform.md](vault-platform.md) |
| P-ACT-014, P-ACT-015, P-ACT-018, P-ACT-024 | Inline below (06-Aug + 02-Aug 2026 vault security + coexistence + monitoring) |

---

## Vault Security Architecture — Agent Execution (06 Aug 2026, v0.33.56)

All items below are PROPOSED — does not exist yet. These proposals address prompt injection via ambient authority in agent execution contexts. Source: vault-authorisation thread (docs 927-931).

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-ACT-014 | Vault kernel state machine (per-transition authorisation) | Vault transitions from per-operation auth ("may this credential write here?") to per-transition auth ("is this the next legal step in the declared execution?"); kernel holds the transition graph, tracks current state, permits/refuses next step, decrements budget; kernel executes nothing (referee, not player); write-as-attestation: external step advances kernel only by depositing output in vault; design constraint: small enough to verify formally (complete mediation, tamper-resistance, verifiability) | doc 928 (v0.33.56) |
| P-ACT-015 | Plugins as capability grants (least-authority plugin surface) | A vault begins with no capabilities; inference plugin = authority to spend on inference; storage plugin = authority to reach specific paths; reference is the permission; migration path: instrument-before-enforce (log implicit grants → measure actual use → require declaration → enforce); ambient authority is injection root cause; removes confused-deputy failure by construction | doc 930 (v0.33.56) |
| P-ACT-018 | Git + sgit coexistence pattern (ignore-file-based boundary) | A single directory holding both a git working tree and a sgit vault; what git holds determines zero-knowledge status; the vault ignore file (NOT YET BUILT) is the precondition for safety; without the ignore file, vault key material may enter git history permanently; coexistence pattern MUST NOT be used until ignore file is shipped and verified | doc 931 (v0.33.56) |

---

## Write-Only Monitoring Vault (02 Aug 2026, v0.33.55)

All items below are PROPOSED — does not exist yet.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-ACT-024 | Write-only monitoring vault (privacy-reconciled telemetry) | Monitoring vault receives telemetry events in write-only mode; visitors can see what is being collected (transparency-by-design resolves stated privacy claim conflict); state shipped off-device; reconciles "nothing leaves the device" with "we collect telemetry" by being explicit about what leaves and showing it | doc 911 (v0.33.55) |
