# SGraph-AI__Desktop — Architecture

**Version:** v0.12.2
**For:** Implementor (LLM coding session)

---

## 1. Repo Structure

```
SGraph-AI__Desktop/
  src-tauri/                           <- RUST BACKEND (Tauri core)
    src/
      main.rs                            Entry point, window creation, plugin setup
      lib.rs                             Library root, command registration
      commands/
        keychain.rs                      macOS Keychain read/write/delete
        files.rs                         Local file operations (read, metadata)
        window.rs                        Window state save/restore
        sites.rs                         Site registry management
      state/
        app_state.rs                     Application state (active site, preferences)
        window_state.rs                  Window position/size persistence
    sgraph-sites.json                    Site registry (URL, icon, label)
    tauri.conf.json                      Tauri configuration
    Cargo.toml                           Rust dependencies
    icons/
      icon.icns                          macOS app icon
      icon.png                           PNG variants for different sizes
    capabilities/
      default.json                       Tauri v2 capability permissions

  src/                                 <- FRONTEND (vanilla JS, local app shell)
    index.html                           Main window HTML
    app-shell/
      v0.1.0/
        app-shell.js                     Main shell component (sidebar + webview container)
        app-shell.css                    Shell styling
      latest/ -> v0.1.0
    sidebar/
      v0.1.0/
        sidebar.js                       Site navigation sidebar
        sidebar.css                      Sidebar styling
      latest/ -> v0.1.0
    settings/
      v0.1.0/
        settings.js                      Settings panel
        settings.css                     Settings styling
      latest/ -> v0.1.0
    status-bar/
      v0.1.0/
        status-bar.js                    Bottom status bar
        status-bar.css                   Status bar styling
      latest/ -> v0.1.0
    lib/
      keychain-bridge.js                 JS wrapper around Tauri keychain commands
      site-manager.js                    Site switching logic
      window-state.js                    Window state save/restore bridge
      event-bus.js                       Cross-component event system
    assets/
      icons/                             Site icons (SVG)
      styles/
        theme.css                        CSS custom properties (Aurora theme)
        reset.css                        CSS reset

  briefs/
    BRIEF_PACK.md                        Session bootstrap document (10 sections)

  .claude/
    CLAUDE.md                            Main project guidance
    explorer/
      CLAUDE.md                          Explorer team session instructions

  .github/
    workflows/
      build-macos.yml                    macOS build + sign + notarise
      release.yml                        Create GitHub release with DMG

  team/
    explorer/
      architect/
        README.md
        ROLE__architect.md
        reviews/
      dev/
        README.md
        ROLE__dev.md
        reviews/
      designer/
        README.md
        ROLE__designer.md
        reviews/
      devops/
        README.md
        ROLE__devops.md
        reviews/
      librarian/
        README.md
        ROLE__librarian.md
        reviews/
        reality/
          v0.1.0__what-exists-today.md
      historian/
        README.md
        ROLE__historian.md
        reviews/
    humans/dinis_cruz/
      briefs/                            READ-ONLY for agents
      debriefs/
      claude-code-web/

  version                                Contains: v0.1.0
  README.md
```

---

## 2. Tauri v2 Configuration

### tauri.conf.json (Key Sections)

```json
{
  "productName": "SGraph Desktop",
  "version": "0.1.0",
  "identifier": "ai.sgraph.desktop",
  "build": {
    "frontendDist": "../src"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "title": "SGraph Desktop",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false,
        "decorations": true
      }
    ],
    "security": {
      "dangerousRemoteUrlIpcAccess": [
        {
          "url": "https://*.sgraph.ai",
          "permissions": ["keychain_get", "keychain_set", "file_info"]
        }
      ]
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "app"],
    "icon": [
      "icons/icon.icns",
      "icons/icon.png"
    ],
    "macOS": {
      "minimumSystemVersion": "13.0",
      "frameworks": [],
      "entitlements": "Entitlements.plist",
      "signingIdentity": null
    }
  },
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/the-cyber-boardroom/SGraph-AI__Desktop/releases/latest/download/latest.json"
      ]
    }
  }
}
```

### Cargo.toml Dependencies

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "macos-private-api"] }
tauri-plugin-opener = "2"
tauri-plugin-updater = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
security-framework = "2"    # macOS Keychain access
dirs = "5"                  # User directories (for state persistence)
```

---

## 3. Multi-Webview Architecture

### Approach: Single Window, Multiple Webviews

Tauri v2 supports multiple webviews within a single window. Each `*.sgraph.ai` site gets its own webview:

```
Main Window
  ├── Local webview (sidebar + status bar — always visible)
  └── Content webviews (one per site — only active one visible)
       ├── send.sgraph.ai
       ├── vault.sgraph.ai
       ├── workspace.sgraph.ai
       └── tools.sgraph.ai
```

### Webview Lifecycle

| State | Behaviour |
|-------|-----------|
| **Created** | Webview created when site first selected |
| **Active** | Visible, receiving events |
| **Background** | Hidden but alive (preserves session state) |
| **Destroyed** | Only on app quit or manual close |

Background webviews keep their state (logged-in sessions, form data, scroll position). Switching sites is instant — just show/hide webviews.

### Navigation Control

The app intercepts navigation to prevent *.sgraph.ai webviews from navigating to external URLs:

```rust
// Only allow navigation within *.sgraph.ai
webview.on_navigation(|url| {
    url.host_str()
        .map(|h| h.ends_with(".sgraph.ai") || h == "sgraph.ai")
        .unwrap_or(false)
});
```

External links open in the default browser.

---

## 4. IPC Command API

### Keychain Commands

```rust
#[tauri::command]
async fn keychain_set(service: &str, account: &str, value: &str) -> Result<(), String>;

#[tauri::command]
async fn keychain_get(service: &str, account: &str) -> Result<Option<String>, String>;

#[tauri::command]
async fn keychain_delete(service: &str, account: &str) -> Result<(), String>;

#[tauri::command]
async fn keychain_list(service: &str) -> Result<Vec<String>, String>;
```

### File Commands

```rust
#[tauri::command]
async fn read_file(path: &str) -> Result<Vec<u8>, String>;

#[tauri::command]
async fn file_info(path: &str) -> Result<FileInfo, String>;

#[tauri::command]
async fn open_file_dialog(filters: Vec<FileFilter>) -> Result<Option<String>, String>;
```

### Window State Commands

```rust
#[tauri::command]
async fn save_window_state(state: WindowState) -> Result<(), String>;

#[tauri::command]
async fn load_window_state() -> Result<WindowState, String>;
```

### Site Management Commands

```rust
#[tauri::command]
async fn get_sites() -> Result<Vec<SiteConfig>, String>;

#[tauri::command]
async fn set_active_site(site_id: &str) -> Result<(), String>;
```

---

## 5. State Persistence

### Window State (JSON file)

Saved to `~/Library/Application Support/ai.sgraph.desktop/window-state.json`:

```json
{
  "window": {
    "x": 100,
    "y": 100,
    "width": 1200,
    "height": 800,
    "fullscreen": false
  },
  "sidebar": {
    "collapsed": false,
    "width": 60
  },
  "activeSite": "send",
  "openSites": ["send", "vault", "workspace"]
}
```

### Keychain Items

| Service | Account | Value |
|---------|---------|-------|
| `sgraph-send` | `access-token` | Access token for send.sgraph.ai |
| `sgraph-vault` | `vault-key-{id}` | Vault encryption key |
| `sgraph-workspace` | `session` | Workspace session data |

---

## 6. macOS Menu Bar

```
SGraph Desktop
  ├── About SGraph Desktop
  ├── Check for Updates...
  ├── Preferences...     (Cmd+,)
  ├── ─────────────
  ├── Quit               (Cmd+Q)

File
  ├── Open File...       (Cmd+O)
  ├── Send File...       (Cmd+Shift+S)

View
  ├── Toggle Sidebar     (Cmd+B)
  ├── ─────────────
  ├── Send               (Cmd+1)
  ├── Vault              (Cmd+2)
  ├── Workspace          (Cmd+3)
  ├── Tools              (Cmd+4)
  ├── ─────────────
  ├── Reload             (Cmd+R)
  ├── Developer Tools    (Cmd+Option+I)

Window
  ├── Minimize           (Cmd+M)
  ├── Zoom
  ├── ─────────────
  ├── Bring All to Front
```

---

## 7. File Type Associations

### Registered Types (in tauri.conf.json)

```json
{
  "bundle": {
    "macOS": {
      "fileAssociations": [
        {
          "ext": ["md", "markdown", "mdown"],
          "name": "Markdown Document",
          "role": "Viewer"
        },
        {
          "ext": ["pdf"],
          "name": "PDF Document",
          "role": "Viewer"
        },
        {
          "ext": ["html", "htm"],
          "name": "HTML Document",
          "role": "Viewer"
        }
      ]
    }
  }
}
```

### File Open Flow

1. User double-clicks `.md` file in Finder
2. macOS launches SGraph Desktop (or brings it to front)
3. Tauri emits `tauri://file-drop` event with file path
4. App reads file via `read_file` command
5. Content displayed in a local viewer webview (reusing SG/Send's markdown-parser component)

---

## 8. Deep Links

### URL Scheme: `sgraph://`

```
sgraph://send/upload          → Open Send, navigate to upload page
sgraph://vault                → Open Vault
sgraph://tools/ssh-keygen     → Open Tools, navigate to SSH Key Generator
sgraph://open?file=/path.md   → Open file in viewer
```

Registered in `tauri.conf.json`:

```json
{
  "plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["sgraph"]
      }
    }
  }
}
```

---

## 9. BRIEF_PACK.md Template

The `briefs/BRIEF_PACK.md` file in the desktop repo must contain these 10 sections:

1. **Project Overview** — what SGraph Desktop is, Tauri architecture, multi-site launcher
2. **Architecture Decisions** — table with decision, source brief, date
3. **Team Roles** — Developer, Architect, Librarian, Designer, DevOps, Explorer
4. **Coding Conventions** — Rust for backend, vanilla JS for frontend, Tauri IPC patterns
5. **Repo Structure** — full folder structure with annotations
6. **Existing Features** — what's built and working
7. **Current Briefs** — links to all relevant briefs with summaries
8. **First Task** — specific, scoped task for the current session
9. **Build Instructions** — `cargo tauri dev`, `cargo tauri build`, signing, notarising
10. **Bootstrap Script** — `git clone`, `cargo tauri dev`

The Librarian updates this file at the end of every session.
