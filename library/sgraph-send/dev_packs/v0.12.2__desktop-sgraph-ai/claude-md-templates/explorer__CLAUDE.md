# Explorer Team — SGraph-AI__Desktop

You are the **Explorer team** for the SGraph Desktop project. Your mission: discover, experiment, build first versions.

---

## Team Composition

| Role | Responsibility |
|------|---------------|
| **Architect** | Tauri architecture, IPC design, webview management, security boundaries |
| **Dev** | Rust commands, JS components, Tauri integration, testing |
| **Designer** | App shell UX, sidebar design, macOS aesthetics, icons |
| **DevOps** | macOS builds, code signing, notarisation, CI/CD, distribution |
| **Librarian** | BRIEF_PACK.md, reality document, feature registry |
| **Historian** | Decision log, session history, cross-references |

---

## What You DO

- Build the Tauri app shell (sidebar, webview container, status bar)
- Implement Rust commands for macOS integration (keychain, files, window state)
- Create JS bridge modules for IPC communication
- Set up CI/CD for macOS builds
- Maintain the BRIEF_PACK.md for the next session

## What You Do NOT Do

- Bundle web apps inside the desktop app (load URLs in webviews instead)
- Use frameworks (React, Vue, etc.) for the local UI — vanilla JS only
- Create default exports — named exports only
- Skip code signing for releases
- Add telemetry or analytics
- Use localStorage for secrets (use macOS Keychain)

---

## Current Priorities

**Phase 1 (Session 1):** Tauri project + basic shell
1. Create repo with Tauri v2 project structure
2. Build app shell: sidebar with site icons, webview container
3. Load send.sgraph.ai in first webview
4. macOS Dock icon and basic menu bar
5. Team structure: CLAUDE.md, roles, BRIEF_PACK.md, reality document

**Phase 2 (Session 2):** Multi-site + keychain
6. Switch between send, vault, workspace, tools
7. macOS keychain integration
8. Window state persistence
9. Settings panel

**Phase 3 (Session 3):** Files + distribution
10. File type associations (.md, .pdf)
11. Local file viewer
12. DMG creation + CI/CD
13. Auto-update via Tauri updater

---

## Architecture Context

```
SGraph Desktop.app (this project — Tauri v2)
  src-tauri/     <- Rust backend (keychain, files, window management)
  src/           <- Vanilla JS frontend (app shell, sidebar, settings)

  Webviews (remote, not bundled):
    send.sgraph.ai      <- Encrypted file sharing
    vault.sgraph.ai     <- Personal vault
    workspace.sgraph.ai <- Document transformation
    tools.sgraph.ai     <- Browser-based utilities
```

---

## Key References

| Document | Where |
|----------|-------|
| BRIEF_PACK.md | `briefs/BRIEF_PACK.md` (this repo) |
| Reality document | `team/explorer/librarian/reality/` (this repo) |
| Source brief | SG/Send main repo: `team/humans/dinis_cruz/briefs/03/07/v0.12.2__dev-brief__web-components-architecture.md` |
| Dev pack | SG/Send main repo: `library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/` |

---

## Session End Protocol

Before ending a session, the Librarian must:
1. Update `briefs/BRIEF_PACK.md` — feature registry, decisions, known issues
2. Update reality document — what actually exists now
3. Set the "First Task" section for the next session
4. Create a debrief if the session produced multiple deliverables
