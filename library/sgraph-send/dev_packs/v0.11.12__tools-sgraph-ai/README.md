# Dev Pack: tools.sgraph.ai — Canonical Component Library and Tool Platform

**Version:** v0.11.12
**Date:** 2026-03-05
**Objective:** Set up `sgraph_ai__tools` repo, build first tools, extract shared modules

---

## Reading Order

| # | File | Purpose |
|---|------|---------|
| 1 | [`07_first-session-brief.md`](07_first-session-brief.md) | **Start here** — orientation for a new Claude Code session |
| 2 | [`BRIEF.md`](BRIEF.md) | Full briefing: what to build, constraints, phases, specs, human decisions |
| 3 | [`architecture.md`](architecture.md) | Three-tier structure, module API contracts, versioning, CDN config |
| 4 | [`03_role-definitions/`](03_role-definitions/) | 6 roles and their responsibilities |
| 5 | [`05_technical-bootstrap-guide.md`](05_technical-bootstrap-guide.md) | Step-by-step repo setup instructions |
| 6 | [`06_what-to-clone.md`](06_what-to-clone.md) | What to reference from the SG/Send main repo |
| 7 | [`code-context.md`](code-context.md) | Actual source code to extract and how to convert |
| 8 | [`08_first-session-prompt.md`](08_first-session-prompt.md) | Copy-paste prompt to bootstrap a new session |
| 9 | [`09_claude-md-review.md`](09_claude-md-review.md) | How to adapt CLAUDE.md for the tools project |
| 10 | [`addenda/appsec.md`](addenda/appsec.md) | Security: client-side enforcement, FFmpeg supply chain, CSP, CORS |
| 11 | [`addenda/architect.md`](addenda/architect.md) | Architecture decisions, migration principles, portability |
| 12 | [`addenda/devops.md`](addenda/devops.md) | S3 + CloudFront, cache headers, CI/CD, local dev |
| 13 | [`reference/briefs-index.md`](reference/briefs-index.md) | Index of all source briefs (4 Mar + 5 Mar) |
| 14 | [`reference/ifd-summary.md`](reference/ifd-summary.md) | IFD methodology for vanilla JS modules |

## Role Definitions

| Role | File |
|------|------|
| Architect | [`03_role-definitions/ROLE__architect.md`](03_role-definitions/ROLE__architect.md) |
| Dev | [`03_role-definitions/ROLE__dev.md`](03_role-definitions/ROLE__dev.md) |
| Designer | [`03_role-definitions/ROLE__designer.md`](03_role-definitions/ROLE__designer.md) |
| DevOps | [`03_role-definitions/ROLE__devops.md`](03_role-definitions/ROLE__devops.md) |
| Librarian | [`03_role-definitions/ROLE__librarian.md`](03_role-definitions/ROLE__librarian.md) |
| Historian | [`03_role-definitions/ROLE__historian.md`](03_role-definitions/ROLE__historian.md) |

## CLAUDE.md Templates

| Template | File |
|----------|------|
| Main CLAUDE.md | [`claude-md-templates/CLAUDE.md`](claude-md-templates/CLAUDE.md) |
| Explorer CLAUDE.md | [`claude-md-templates/explorer__CLAUDE.md`](claude-md-templates/explorer__CLAUDE.md) |

---

## Quick Start

```bash
# The target repo (to be created):
git clone [repo-url] sgraph_ai__tools
cd sgraph_ai__tools

# No dependencies — it's all vanilla JS
python3 -m http.server 8080
open http://localhost:8080/tools/
```

---

## Summary

This dev pack bootstraps a new Claude Code session to build `sgraph_ai__tools` — the canonical component library for the SGraph ecosystem. It synthesises decisions from 4 March (v0.11.1) and 5 March (v0.11.08) briefs covering:

- **Dependency inversion:** tools.sgraph.ai is the source, send/vault/workspace import from it
- **Three-tier architecture:** core (pure JS) / components (UI) / tools (standalone pages)
- **Module extraction:** crypto.js, api-client.js, i18n.js, file-detect.js, markdown-parser.js, llm-client
- **First tools:** Video Splitter (FFmpeg WASM), SSH Key Generator (migrate), LLM Client, File Hasher
- **CDN-served ES modules:** folder-based versioning, immutable cache for pinned versions

**Definition of done:** tools.sgraph.ai live with landing page, SSH keygen working, Video Splitter working, crypto.js importable via CDN URL.
