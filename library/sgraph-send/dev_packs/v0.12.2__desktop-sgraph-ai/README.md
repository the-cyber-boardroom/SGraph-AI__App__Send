# Dev Pack: SGraph-AI__Desktop — Tauri Desktop Application for macOS

**Version:** v0.12.2
**Date:** 2026-03-08
**Objective:** Set up `SGraph-AI__Desktop` repo, build a Tauri-based macOS desktop app providing easy access to all `*.sgraph.ai` websites

---

## Reading Order

| # | File | Purpose |
|---|------|---------|
| 1 | [`07_first-session-brief.md`](07_first-session-brief.md) | **Start here** — orientation for a new Claude Code session |
| 2 | [`BRIEF.md`](BRIEF.md) | Full briefing: what to build, constraints, phases, specs, human decisions |
| 3 | [`architecture.md`](architecture.md) | Tauri architecture, window management, webview config, Rust backend |
| 4 | [`03_role-definitions/`](03_role-definitions/) | 6 roles and their responsibilities |
| 5 | [`05_technical-bootstrap-guide.md`](05_technical-bootstrap-guide.md) | Step-by-step repo setup instructions |
| 6 | [`06_what-to-clone.md`](06_what-to-clone.md) | What to reference from the SG/Send main repo |
| 7 | [`code-context.md`](code-context.md) | Existing code patterns and Tauri integration points |
| 8 | [`08_first-session-prompt.md`](08_first-session-prompt.md) | Copy-paste prompt to bootstrap a new session |
| 9 | [`09_claude-md-review.md`](09_claude-md-review.md) | How to adapt CLAUDE.md for the desktop project |
| 10 | [`addenda/appsec.md`](addenda/appsec.md) | Security: webview isolation, IPC, code signing, keychain |
| 11 | [`addenda/architect.md`](addenda/architect.md) | Architecture decisions, multi-window strategy, update mechanism |
| 12 | [`addenda/devops.md`](addenda/devops.md) | macOS builds, code signing, notarisation, auto-update, CI/CD |
| 13 | [`reference/briefs-index.md`](reference/briefs-index.md) | Index of all source briefs |
| 14 | [`reference/ifd-summary.md`](reference/ifd-summary.md) | IFD methodology for desktop app development |

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
git clone [repo-url] SGraph-AI__Desktop
cd SGraph-AI__Desktop

# Prerequisites:
# - Rust toolchain (rustup)
# - Node.js (for Tauri CLI)
# - Xcode Command Line Tools (macOS)

# Install Tauri CLI
cargo install tauri-cli

# Dev mode (opens app with hot-reload)
cargo tauri dev

# Build release
cargo tauri build
```

---

## Summary

This dev pack bootstraps a new Claude Code session to build `SGraph-AI__Desktop` — a lightweight Tauri-based macOS desktop app that provides native access to the SGraph ecosystem websites. It synthesises the desktop app exploration from the 7 March brief (v0.12.2) covering:

- **Tauri v2:** ~10MB binary, native macOS WebKit webview, Rust backend
- **Multi-site launcher:** Single app providing tabbed/windowed access to send.sgraph.ai, vault.sgraph.ai, workspace.sgraph.ai, tools.sgraph.ai
- **Native integration:** macOS keychain for token storage, file type associations, menu bar quick access
- **Web Components reuse:** Same sg-layout framework and components from the web, rendered in Tauri's webview
- **Offline capable:** Cached static assets, local vault access

**Definition of done:** SGraph Desktop.app launches on macOS, loads send.sgraph.ai in a native window, stores access tokens in the macOS keychain, and opens `.md` files in the SG/Send viewer.
