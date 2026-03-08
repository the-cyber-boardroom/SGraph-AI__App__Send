# First Session Brief

**Version:** v0.12.2
**Date:** 8 March 2026
**Purpose:** Orientation for the first Claude Code session on the SGraph-AI__Desktop repo

---

## Who You Are

You are the **Explorer team** for the SGraph-AI__Desktop project. You have 6 roles: Architect, Dev, Designer, DevOps, Librarian, Historian.

## What You're Building

A lightweight Tauri-based macOS desktop application that provides native access to the SGraph ecosystem:

- **App shell** — Sidebar + webview container wrapping `*.sgraph.ai` websites
- **Multi-site launcher** — Switch between Send, Vault, Workspace, Tools in a single app
- **Native macOS integration** — Keychain for secrets, Dock icon, menu bar, file associations
- **Offline-aware** — Graceful handling when sites are unreachable

This is NOT a rebuild of the web apps. The web apps already exist. This is a native wrapper that makes them a first-class macOS citizen.

## What You Already Know

The architecture has been designed. Read the briefs in the SG/Send main repo:

```
/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/07/v0.12.2__dev-brief__web-components-architecture.md
```

Part 4 of that brief covers the Desktop App Exploration. Key decisions are already made (see `03_role-definitions/ROLE__historian.md` for the full list).

## Your First Session Goals

**Team structure first. Tauri project second. Basic app shell third. First webview fourth.**

### Session 1 Deliverables

1. **Tauri project** — `cargo tauri dev` compiles and launches on macOS
2. **CLAUDE.md files** — main + explorer team (adapt from templates in `09_claude-md-review.md`)
3. **Team structure** — `team/explorer/{role}/` with README.md + ROLE files for all 6 roles
4. **BRIEF_PACK.md** — 10-section session bootstrap document at `briefs/BRIEF_PACK.md`
5. **Reality document** — initial `team/explorer/librarian/reality/v0.1.0__what-exists-today.md`
6. **App shell** — sidebar with site icons, content area for webviews
7. **First webview** — send.sgraph.ai loads inside the app
8. **macOS Dock icon** — app appears in Dock with proper icon
9. **Menu bar** — basic macOS menu with keyboard shortcuts

### Reading Order

1. This file (you're reading it)
2. `BRIEF.md` — full briefing with phases, constraints, specifications
3. `architecture.md` — Tauri structure, multi-webview, IPC commands, window management
4. `code-context.md` — Tauri boilerplate, Rust commands, JS components
5. `05_technical-bootstrap-guide.md` — step-by-step repo setup
6. `06_what-to-clone.md` — what to reference from the SG/Send main repo

Then read the role definitions:
7. `03_role-definitions/ROLE__architect.md`
8. `03_role-definitions/ROLE__dev.md`
9. `03_role-definitions/ROLE__designer.md`
10. `03_role-definitions/ROLE__devops.md`
11. `03_role-definitions/ROLE__librarian.md`
12. `03_role-definitions/ROLE__historian.md`

And the source brief from the SG/Send main repo:
13. `/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/07/v0.12.2__dev-brief__web-components-architecture.md`

And the CLAUDE.md templates:
14. `09_claude-md-review.md`

## Critical Reminders

- **Tauri v2.** Not Tauri v1. The API is significantly different.
- **macOS first.** Target arm64 (Apple Silicon). Intel via universal binary later.
- **Vanilla JS** for the local shell UI. Same pattern as tools.sgraph.ai. No frameworks.
- **Rust for native.** Keychain, file ops, window management — all in Rust via Tauri commands.
- **Remote webviews.** Load `*.sgraph.ai` URLs. Do NOT bundle or proxy the web apps.
- **Team structure before features.** CLAUDE.md, roles, BRIEF_PACK.md before writing app code.
- **No telemetry.** Zero analytics, zero tracking in the desktop app.
