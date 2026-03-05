# Dev Pack: tools.sgraph.ai — Canonical Component Library and Tool Platform

**Version:** v0.11.12
**Date:** 2026-03-05
**Objective:** Set up `sgraph_ai__tools` repo, build first tools, extract shared modules

---

## Reading Order

| # | File | Purpose |
|---|------|---------|
| 1 | `BRIEF.md` | **Start here.** What to build, constraints, phases, files to read, human decisions. |
| 2 | `architecture.md` | Three-tier structure, versioning model, module API contracts, CDN config, BRIEF_PACK template. |
| 3 | `code-context.md` | Actual source code from the existing codebase — the modules to extract and how to convert them. |
| 4 | `addenda/appsec.md` | Security: client-side enforcement, FFmpeg supply chain, CSP, CORS. |
| 5 | `addenda/architect.md` | Architecture decisions table, migration principles, component portability. |
| 6 | `addenda/devops.md` | S3 + CloudFront setup, cache headers, CI/CD pipeline, local development. |
| 7 | `reference/briefs-index.md` | Index of all source briefs (4 Mar + 5 Mar) with summaries. |
| 8 | `reference/ifd-summary.md` | IFD methodology applied to vanilla JS modules. |

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
