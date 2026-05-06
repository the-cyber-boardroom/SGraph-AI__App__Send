# Reality — What Actually Exists

This folder is the canonical, code-verified record of what SGraph Send actually implements.

## Why This Exists

Agents were confusing ideas described in briefs with features that actually exist in code.
This folder fixes that — every claim is verified by reading source code, not documentation.

## Structure (Domain Tree)

The reality system is a **fractal domain tree**. Each domain covers one coherent system area.
Each domain file stays under ~300 lines. When a file grows too large, it splits into sub-files.

```
reality/
  README.md              ← this file
  index.md               ← master entry point: all domains + quick stats
  changelog.md           ← pointer log: date | domain updated | one line

  send-api/              ← User Lambda (send.sgraph.ai HTTP endpoints)
  admin-api/             ← Admin Lambda (auth-protected endpoints)
  vault/                 ← Vault/SGit crypto + storage layer
  cli/                   ← sgit CLI (PyPI: sgit-ai)
  website/               ← sgraph.ai website
  ui/                    ← Three browser UIs (user, admin, workspace)
  tools/                 ← tools.sgraph.ai
  infra/                 ← Deployment, CI/CD, infrastructure
  security/              ← Security properties, violations, AppSec
  identity/              ← Credentials, OAuth, billing
  ai-agents/             ← Agentic workflows, LLM components, MCP
  qa/                    ← Tests that pass, QA infrastructure
  alchemist/             ← Investor materials, Alchemist system
```

Each domain directory contains:
- `index.md` — EXISTS items + PROPOSED summary + links to sub-files
- `proposed/index.md` — full list of proposed features for this domain
- Sub-files (created when index.md exceeds ~300 lines)

## Rules

1. **If it's not in a domain index, it does not exist.** No agent may claim a feature is
   "working" or "shipped" unless it appears in the appropriate domain's EXISTS section.
2. **Proposed features must be labelled.** If an agent describes something not in the EXISTS
   section, they must write: "PROPOSED — does not exist yet."
3. **Code authors update the domain index.** When code ships that adds, removes, or changes
   an endpoint, UI page, or test, update the relevant domain's `index.md` in the same commit.
4. **The Librarian verifies and maintains.** The Librarian cross-checks domain indexes against
   the codebase daily and updates `changelog.md` with a pointer entry.
5. **Fractal growth rule.** When any file exceeds ~300 lines, split it. Never let files grow
   large — create a sub-file and link from the index. See DAILY_RUN.md for queued splits.

## Entry Point

Start at [`index.md`](index.md) — it maps all 13 domains and their EXISTS item counts.

## Archived Monolith

The pre-split monolith is preserved at `v0.16.26__what-exists-today.md` (237KB, 2,975 lines).
It serves as a historical archive. New content goes into domain files only.

Historical reality snapshots (superseded, preserved for reference):
- `v0.6.36__what-exists-today.md` — Reality as of v0.6.36 (2026-02-26)
- `v0.7.6__what-exists-today.md` — Reality as of v0.7.6 (2026-02-28)
- `v0.10.44__what-exists-today.md` — Reality as of v0.10.44
- `v0.10.49__what-exists-today.md` — Reality as of v0.10.49
- `v0.13.34__what-exists-today.md` — Reality as of v0.13.34
