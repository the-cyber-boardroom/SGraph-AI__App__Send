# SGraph-AI__Desktop — Dev Pack

**Version:** v0.12.2
**Date:** 2026-03-08
**Pack type:** Workstream (full pack)
**Target audience:** LLM coding session (Claude Code)
**Objective:** Set up the `SGraph-AI__Desktop` repo, build a Tauri-based macOS desktop app that provides easy access to all `*.sgraph.ai` websites

---

## What You Are Building

A **lightweight macOS desktop application** using Tauri that wraps the SGraph ecosystem websites in native windows. This involves:

1. **Repo setup** (`SGraph-AI__Desktop`) — Tauri project with Rust backend + vanilla JS frontend
2. **Multi-site launcher** — tabbed or multi-window access to send.sgraph.ai, vault.sgraph.ai, workspace.sgraph.ai, tools.sgraph.ai
3. **Native macOS integration** — keychain for token/key storage, Dock icon, menu bar, file associations
4. **Local navigation shell** — lightweight local HTML/JS that provides the app chrome (sidebar, tabs) wrapping remote webviews
5. **File type associations** — open `.md`, `.pdf`, `.html` files in the SG/Send viewer
6. **Auto-update** — Tauri's built-in updater for seamless version updates
7. **CI/CD** — GitHub Actions for macOS builds, code signing, notarisation, DMG distribution

---

## The Need (From the Brief)

> "The human finds it annoying to open markdown files on the computer — it fires up VS Code, Cursor, or other heavy editors. A lightweight app that just opens the SG/Send web UI with local storage access would be useful."

The desktop app solves:
- **Quick access:** One click to send.sgraph.ai, vault, workspace, tools — not buried in browser tabs
- **Native feel:** macOS Dock icon, Cmd+Tab switching, proper window management
- **Secure storage:** Access tokens and vault keys stored in macOS keychain (not localStorage)
- **File associations:** Double-click a .md file → opens in SG/Send viewer (not VS Code)
- **Persistent sessions:** App remembers which sites were open, window positions, active sessions

---

## Key Constraints

| Constraint | Detail |
|-----------|--------|
| **Tauri v2** | ~10MB binary, native macOS webview (WebKit), Rust backend |
| **macOS first** | Primary target is macOS/arm64. Windows/Linux later. |
| **Web-first content** | The app loads `*.sgraph.ai` URLs in webviews — it does NOT bundle the web apps |
| **Vanilla JS for local UI** | App chrome (sidebar, tabs, settings) uses vanilla JS — same pattern as tools.sgraph.ai |
| **No frameworks** | No React, Vue, etc. for the local UI layer |
| **Rust for native** | macOS keychain access, file system operations, menu bar — all in Rust |
| **Existing web components** | Reuse sg-layout, sg-header, sg-footer from tools.sgraph.ai where appropriate |
| **Privacy by default** | No telemetry, no analytics, no data collection in the desktop app |
| **IFD versioning** | Folder-based versioning for the local UI assets |

---

## Where This Fits in the Architecture

```
CURRENT (browser-based):

User opens browser tab → send.sgraph.ai
User opens browser tab → vault.sgraph.ai
User opens browser tab → workspace.sgraph.ai
User opens browser tab → tools.sgraph.ai

Scattered across tabs. Mixed with other browsing.
Tokens in localStorage (cleared by browser cleanup).

AFTER (desktop app):

SGraph Desktop.app
  ├── Sidebar: site launcher
  │   ├── Send    → webview: send.sgraph.ai
  │   ├── Vault   → webview: vault.sgraph.ai
  │   ├── Workspace → webview: workspace.sgraph.ai
  │   └── Tools   → webview: tools.sgraph.ai
  ├── Menu bar: quick actions
  ├── File associations: .md → SG viewer
  └── Keychain: tokens, vault keys

Single app. All SGraph sites in one place.
Tokens in macOS keychain (persistent, secure).
```

---

## Tauri Architecture

### Tauri v2 Features We Use

| Feature | How We Use It |
|---------|--------------|
| **Multi-webview** | Each `*.sgraph.ai` site in its own webview |
| **IPC (invoke)** | JS calls Rust for keychain, file ops |
| **Menu API** | macOS menu bar with keyboard shortcuts |
| **Tray/Dock** | Dock icon, right-click menu |
| **Updater** | Built-in auto-update from GitHub releases |
| **Deep links** | `sgraph://` URL scheme for cross-app linking |
| **File associations** | Register as handler for .md, .pdf, .html |
| **Window management** | Save/restore window positions and tabs |

---

## 4 Phases

### Phase 1: Repo Setup and Basic App

1. Create `SGraph-AI__Desktop` repo with Tauri v2 project structure
2. Configure Tauri for macOS/arm64
3. Build basic app shell: sidebar with site list, single webview panel
4. Load send.sgraph.ai in the webview
5. Add macOS Dock icon and menu bar
6. Team structure: CLAUDE.md, roles, BRIEF_PACK.md, reality document

### Phase 2: Multi-Site and Native Integration

7. Multi-webview: switch between send, vault, workspace, tools
8. Tabbed browsing within each site (or sg-layout integration)
9. macOS keychain integration for access tokens
10. Window state persistence (position, size, active tab)
11. Settings panel (sites list, default site, startup behaviour)

### Phase 3: File Associations and Viewer

12. Register file type associations (.md, .pdf, .html)
13. Build local file viewer (opens files in SG/Send viewer webview)
14. Drag-and-drop files onto app to send via send.sgraph.ai
15. Quick-send: right-click file in Finder → "Send with SGraph"

### Phase 4: Distribution and Updates

16. Code signing with Apple Developer certificate
17. Notarisation via Apple's notary service
18. DMG/installer creation
19. Auto-update via Tauri updater (GitHub releases)
20. CI/CD pipeline for automated builds and releases

---

## App Shell Design

### Local UI (vanilla JS, runs in Tauri)

The app has a thin local UI layer that wraps the remote webviews:

```
+--------------------------------------------------+
| SGraph Desktop                    [−] [□] [×]    |
+--------+-----------------------------------------+
|        |                                         |
| [Send] |   ┌─────────────────────────────────┐   |
|        |   │                                 │   |
| [Vault]|   │   send.sgraph.ai               │   |
|        |   │   (loaded in webview)           │   |
| [Work- |   │                                 │   |
|  space]|   │                                 │   |
|        |   │                                 │   |
| [Tools]|   │                                 │   |
|        |   │                                 │   |
+--------+   └─────────────────────────────────┘   |
|        |                                         |
| [⚙]   |   send.sgraph.ai — Ready               |
+--------+-----------------------------------------+
```

### Sidebar

- Site icons (Send, Vault, Workspace, Tools)
- Active site highlighted
- Settings gear at bottom
- Collapsible (Cmd+B to toggle)

### Status Bar

- Current URL
- Connection status (online/offline)
- Encryption indicator

---

## Rust Backend Commands (IPC)

The local JS calls Rust via Tauri's `invoke()` for native operations:

```rust
// src-tauri/src/commands/keychain.rs

/// Store a value in the macOS keychain
#[tauri::command]
async fn keychain_set(service: String, account: String, value: String) -> Result<(), String> {
    // Uses security-framework crate for macOS Keychain Services API
}

/// Retrieve a value from the macOS keychain
#[tauri::command]
async fn keychain_get(service: String, account: String) -> Result<Option<String>, String> {
    // Returns None if not found
}

/// Delete a value from the macOS keychain
#[tauri::command]
async fn keychain_delete(service: String, account: String) -> Result<(), String> {
    // Removes the keychain item
}
```

```rust
// src-tauri/src/commands/files.rs

/// Open a file and return its contents
#[tauri::command]
async fn read_file(path: String) -> Result<Vec<u8>, String> {
    // Read file from local filesystem
}

/// Get file metadata (size, type, modified date)
#[tauri::command]
async fn file_info(path: String) -> Result<FileInfo, String> {
    // Return file metadata for the viewer
}
```

```javascript
// Frontend JS calls:
const token = await window.__TAURI__.core.invoke('keychain_get', {
    service: 'sgraph-send',
    account: 'access-token'
});
```

---

## Sites Registry

| Site | URL | Icon | Description |
|------|-----|------|-------------|
| **Send** | `https://send.sgraph.ai` | Upload arrow | Zero-knowledge file sharing |
| **Vault** | `https://vault.sgraph.ai` | Lock/shield | Encrypted personal vault |
| **Workspace** | `https://workspace.sgraph.ai` | Grid/panels | Document transformation studio |
| **Tools** | `https://tools.sgraph.ai` | Wrench | Browser-based utilities |
| **Admin** | `https://admin.sgraph.ai` | Gear | Admin console (optional) |

Sites are configured in `src-tauri/sgraph-sites.json` — easy to add new `*.sgraph.ai` sites without code changes.

---

## Human Decisions (already made — follow these)

| Question | Answer |
|----------|--------|
| Framework? | **Tauri v2.** |
| Target OS? | **macOS first.** arm64 (Apple Silicon). Intel via universal binary. Windows/Linux later. |
| Local UI? | **Vanilla JS.** Same pattern as tools.sgraph.ai. No frameworks. |
| Content source? | **Remote webviews.** Load *.sgraph.ai URLs. Don't bundle web apps. |
| Token storage? | **macOS Keychain.** Not localStorage. |
| File viewer? | **SG/Send viewer via webview.** Not a custom viewer. |
| Distribution? | **GitHub Releases + DMG.** Not Mac App Store (yet). |
| Auto-update? | **Tauri updater.** Check GitHub releases on startup. |
| Analytics? | **None.** Zero telemetry. |

---

## Files to Read First

### Source Briefs (in SG/Send main repo)

1. **Web Components Architecture** (dev brief): `team/humans/dinis_cruz/briefs/03/07/v0.12.2__dev-brief__web-components-architecture.md` — Part 4: Desktop App Exploration (the primary source brief for this project)
2. **sg-layout Architecture** (arch brief): `team/humans/dinis_cruz/briefs/03/07/v0.11.25__arch-brief__sg-layout-framework-architecture.md` — the layout framework the desktop app will use
3. **sg-layout Implementation** (dev brief): `team/humans/dinis_cruz/briefs/03/07/v0.11.25__dev-brief__sg-layout-implementation-plan.md` — implementation plan for the layout framework
4. **Chrome Extension Key Vault** (dev brief): `team/humans/dinis_cruz/briefs/03/04/v0.11.1__dev-brief__chrome-extension-key-vault.md` — related: chrome extension approach to key storage

### Existing Code Patterns (in SG/Send main repo)

5. **Workspace shell**: `sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/components/workspace-shell/workspace-shell.js` — reference for shell/panel architecture
6. **Send header**: `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/components/send-header/send-header.js` — header component pattern

### Architecture References

7. **IFD guide**: `library/guides/development/ifd/v1.2.1__ifd__intro-and-how-to-use.md` — IFD methodology
8. **Tools dev pack**: `library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/` — sibling project, same team structure

---

## Definition of Done

### Session 1 (MVP)

- [ ] Tauri v2 project compiles and runs on macOS/arm64
- [ ] App shell with sidebar and single webview loading send.sgraph.ai
- [ ] macOS Dock icon and basic menu bar
- [ ] Team structure: CLAUDE.md, 6 roles, BRIEF_PACK.md, reality document
- [ ] `cargo tauri dev` works for local development

### Session 2 (Multi-Site + Keychain)

- [ ] Switch between send, vault, workspace, tools via sidebar
- [ ] macOS keychain stores/retrieves access tokens
- [ ] Window state persisted across restarts
- [ ] Settings panel with site configuration

### Session 3 (Files + Distribution)

- [ ] File type associations (.md, .pdf) registered on macOS
- [ ] Files open in SG/Send viewer webview
- [ ] DMG installer builds via CI/CD
- [ ] Auto-update checks GitHub releases

---

## How to Read This Pack

| File | Purpose |
|------|---------|
| `BRIEF.md` | This file — start here |
| `architecture.md` | Tauri structure, multi-webview, IPC commands, window management |
| `code-context.md` | Existing shell patterns, Tauri boilerplate, IPC examples |
| `addenda/appsec.md` | Security: webview isolation, keychain, code signing, sandboxing |
| `addenda/architect.md` | Architecture decisions, multi-window vs tabs, update strategy |
| `addenda/devops.md` | macOS builds, code signing, notarisation, CI/CD, DMG creation |
| `reference/briefs-index.md` | Index of all source briefs with one-line summaries |
| `reference/ifd-summary.md` | IFD methodology applied to Tauri desktop development |
