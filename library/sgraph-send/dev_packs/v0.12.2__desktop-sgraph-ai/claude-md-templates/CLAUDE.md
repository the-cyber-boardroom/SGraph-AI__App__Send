# SGraph-AI__Desktop — Agent Guidance

**Read this before starting any task.** This file is the single source of truth for all agents and roles working on SGraph-AI__Desktop.

---

## MEMORY.md Policy

**Do NOT use MEMORY.md** (the auto-memory at `~/.claude/projects/.../memory/MEMORY.md`). All persistent project knowledge is maintained by the Librarian in the repo itself via `briefs/BRIEF_PACK.md`.

---

## Reality Document — MANDATORY CHECK

**Before describing, assessing, or assuming what SGraph Desktop can do, READ:**

`team/explorer/librarian/reality/{version}__what-exists-today.md`

### Rules (Non-Negotiable)

1. **If the reality document doesn't list it, it does not exist.**
2. **Proposed features must be labelled.** Write: "PROPOSED — does not exist yet."
3. **Update the reality document when you change code.** Same commit.

---

## Team Structure: Explorer

This project operates as a single **Explorer team** with 6 roles:

| Role | Responsibility |
|------|---------------|
| **Architect** | Tauri architecture, IPC design, webview management, security boundaries |
| **Dev** | Rust commands, JS components, Tauri integration, testing |
| **Designer** | App shell UX, sidebar design, macOS aesthetics, icons |
| **DevOps** | macOS builds, code signing, notarisation, CI/CD, distribution |
| **Librarian** | BRIEF_PACK.md, reality document, feature registry |
| **Historian** | Decision tracking, session history |

---

## Project

**SGraph-AI__Desktop** — a lightweight Tauri-based macOS desktop application at providing native access to the SGraph ecosystem websites (`*.sgraph.ai`).

The app wraps `send.sgraph.ai`, `vault.sgraph.ai`, `workspace.sgraph.ai`, and `tools.sgraph.ai` in native webviews with macOS integration (Keychain, Dock, menu bar, file associations).

**Version file:** `version`

---

## Stack

| Layer | Technology | Rule |
|-------|-----------|------|
| Desktop framework | Tauri v2 | Not Electron. Not v1. |
| Backend language | Rust | All native OS operations via Tauri commands |
| Frontend language | Vanilla JavaScript (ES modules) | No frameworks, no build step |
| Webview engine | WebKit (macOS system) | Remote webviews load *.sgraph.ai URLs |
| Secret storage | macOS Keychain | Via security-framework crate |
| Components | Web Components | Light DOM only, no Shadow DOM |
| Styling | Vanilla CSS | CSS custom properties for theming |
| Distribution | GitHub Releases + DMG | Not Mac App Store |
| Auto-update | Tauri updater plugin | Checks GitHub Releases on startup |
| Versioning | Folder-based (JS), semver (app) | `v0.1.0/`, `latest/` for JS; `v0.x.0` for app |

---

## Key Rules

### Code Patterns

1. **Tauri v2 API** — use `#[tauri::command]` for Rust commands, `invoke()` for JS calls
2. **No frameworks** — vanilla JS for local UI, ES modules, no build step
3. **Named exports only** — no default exports in JS
4. **JSDoc** on every exported JS function
5. **Remote webviews** — load *.sgraph.ai URLs, do NOT bundle web apps
6. **IPC scoping** — each webview gets only the commands it needs
7. **EventBus** — cross-component communication via EventBus pattern

### Security

8. **Keychain for secrets** — never localStorage for tokens or keys
9. **Navigation control** — webviews restricted to *.sgraph.ai URLs
10. **No telemetry** — zero analytics, zero tracking
11. **Code signing required** — all releases signed and notarised

### File Naming

12. **Rust:** snake_case (`keychain.rs`, `app_state.rs`)
13. **JS:** kebab-case (`app-shell.js`, `keychain-bridge.js`)
14. **Review files:** `team/explorer/{role}/reviews/{date}/{version}__{description}.md`

### Git

15. **Default branch:** `dev`
16. **Feature branches** branch from `dev`
17. **Branch naming:** `claude/{description}-{session-id}`
18. **Always push with:** `git push -u origin {branch-name}`

---

## Role System

Each role produces review documents at `team/explorer/{role}/reviews/`. The Librarian maintains the master index.

**Dinis Cruz** is the human stakeholder. His briefs live in `team/humans/dinis_cruz/briefs/` — **read-only for agents**. Agent outputs go to `team/humans/dinis_cruz/claude-code-web/` or role review folders.

Before starting work, check:
1. **BRIEF_PACK.md** at `briefs/BRIEF_PACK.md` — session bootstrap
2. **Reality document** — what actually exists
3. Latest human brief in `team/humans/dinis_cruz/briefs/`
4. Your role's previous reviews

---

## Key Documents

| Document | Location |
|----------|----------|
| **BRIEF_PACK.md** | `briefs/BRIEF_PACK.md` |
| **Reality document** | `team/explorer/librarian/reality/` |
| **Source brief** (in SG/Send main repo) | `team/humans/dinis_cruz/briefs/03/07/v0.12.2__dev-brief__web-components-architecture.md` |
| **Dev pack** (in SG/Send main repo) | `library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/` |
