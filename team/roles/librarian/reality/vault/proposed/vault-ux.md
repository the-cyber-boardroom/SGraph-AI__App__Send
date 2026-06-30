# vault/proposed — Browser UI & UX

**Domain:** `vault/` | **Last updated:** 2026-06-30 | **Maintained by:** Librarian
**Source:** briefs 03/18, 04/03, 05/16

---

## Vault Browser UI (v0.16.26 — 03/18)

**PROPOSED — does not exist yet.**

Auto-commit mode, auto-sync (opt-in background push/pull), commit history visualisation,
in-browser file editing (text, markdown, JSON, code), conflict resolution UI (side-by-side diff),
6 new Web Components (`sg-vault-status`, `sg-vault-editor`, `sg-vault-viewer`, `sg-vault-history`,
`sg-vault-branches`, `sg-vault-conflicts`). Vault-Browse unification (03/29 Architect brief).

*Source: monolith Section 16 lines 1269–1279, Section 17 lines 1644–1656.*

---

## Browser Virtual File System (04/03 — arch brief, doc 221)

**PROPOSED — does not exist yet.**

VFS bridge and BrowseDataSource interface. Vault as universal data layer. VFS exposed to
browser tools as a uniform file system abstraction.

*Source: monolith Section 20 lines 1847–1900.*

---

## SGit Browser Web Components (04/03 — dev brief, doc 220)

**PROPOSED — does not exist yet.**

Vault-aware Web Components for browser: `sg-vault-picker`, vault browse components.
Read-only consumers using `structure_key` once split is implemented.

*Note: `sg-vault-picker` was later shipped in v0.3.2 — it EXISTS in ui/index.md.*

*Source: monolith Section 20 lines 1866–1888.*

---

## Vault Demo Capabilities (05/16 briefs — doc 417)

**PROPOSED — does not exist yet.**

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-128 | Read-only vault opening — polished | Visual read-only badge/banner, mobile responsive, polished load, "make this your own" CTA | doc 417 |
| P-129 | Session-scoped client-side changes | In-memory state shim over JS API; overrides reads; writes land in-session; discarded on refresh/tab-close | doc 417 |
| P-130 | Cross-vault navigation defaults | New tab for cross-vault links; same tab for in-vault anchors; share tokens carried in cross-vault links | doc 417 |
| P-131 | "Make this your own" CTA on read-only views | Conversion path from read-only visitor to account holder | doc 417 |
| P-132 | Session change reset capability | Clear session-scoped changes without reloading the page | doc 417 |

---

## Vault Testing Framework (05/16 briefs — doc 418)

**PROPOSED — does not exist yet.**

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-133 | Four-layer vault testing model | Unit / integration / QA / browser-automation, all via the vault JS API surface | doc 418 |
| P-134 | Vitest-based test runner for unit/integration layers | Vitest wrapping with vault-aware context helpers | doc 418 |
| P-135 | Playwright-based test runner for browser-automation layer | Playwright driving real browsers against deployed vault URLs | doc 418 |
| P-136 | Unified test definition format with `layer` option | Single test file format routes tests to correct execution environment | doc 418 |
| P-137 | Per-vault test fixture support | Committed test data in vault; reproducible across runs; lives in vault for portability | doc 418 |
