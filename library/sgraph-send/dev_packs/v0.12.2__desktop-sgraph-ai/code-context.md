# SGraph-AI__Desktop — Code Context

**Version:** v0.12.2
**Purpose:** Existing code patterns to reference and Tauri boilerplate for the desktop app

---

## 1. Tauri v2 Boilerplate — main.rs

The entry point creates the app, registers commands, and sets up plugins:

```rust
// src-tauri/src/main.rs

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sgraph_desktop_lib::run()
}
```

```rust
// src-tauri/src/lib.rs

mod commands;
mod state;

use commands::{keychain, files, window, sites};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            keychain::keychain_set,
            keychain::keychain_get,
            keychain::keychain_delete,
            keychain::keychain_list,
            files::read_file,
            files::file_info,
            files::open_file_dialog,
            window::save_window_state,
            window::load_window_state,
            sites::get_sites,
            sites::set_active_site,
        ])
        .setup(|app| {
            // Load window state and restore position
            // Set up menu bar
            // Register deep link handler
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SGraph Desktop");
}
```

---

## 2. Keychain Integration (macOS)

Using the `security-framework` crate for native macOS Keychain Services:

```rust
// src-tauri/src/commands/keychain.rs

use security_framework::passwords::{
    set_generic_password, get_generic_password, delete_generic_password,
};

/// Store a value in the macOS keychain
#[tauri::command]
pub async fn keychain_set(service: String, account: String, value: String) -> Result<(), String> {
    set_generic_password(&service, &account, value.as_bytes())
        .map_err(|e| format!("Keychain set failed: {}", e))
}

/// Retrieve a value from the macOS keychain
#[tauri::command]
pub async fn keychain_get(service: String, account: String) -> Result<Option<String>, String> {
    match get_generic_password(&service, &account) {
        Ok(bytes) => {
            let value = String::from_utf8(bytes.to_vec())
                .map_err(|e| format!("UTF-8 decode failed: {}", e))?;
            Ok(Some(value))
        }
        Err(e) if e.code() == -25300 => Ok(None), // errSecItemNotFound
        Err(e) => Err(format!("Keychain get failed: {}", e)),
    }
}

/// Delete a value from the macOS keychain
#[tauri::command]
pub async fn keychain_delete(service: String, account: String) -> Result<(), String> {
    delete_generic_password(&service, &account)
        .map_err(|e| format!("Keychain delete failed: {}", e))
}

/// List all accounts for a service
#[tauri::command]
pub async fn keychain_list(service: String) -> Result<Vec<String>, String> {
    // Query keychain for all items with the given service
    // Returns account names
    todo!("Implement keychain list")
}
```

---

## 3. File Operations

```rust
// src-tauri/src/commands/files.rs

use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub extension: String,
    pub modified: u64,
    pub is_directory: bool,
}

/// Read a file's contents
#[tauri::command]
pub async fn read_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("Read failed: {}", e))
}

/// Get file metadata
#[tauri::command]
pub async fn file_info(path: String) -> Result<FileInfo, String> {
    let p = Path::new(&path);
    let meta = fs::metadata(&path).map_err(|e| format!("Metadata failed: {}", e))?;

    Ok(FileInfo {
        name: p.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string(),
        path: path.clone(),
        size: meta.len(),
        extension: p.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_string(),
        modified: meta.modified()
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs())
            .unwrap_or(0),
        is_directory: meta.is_dir(),
    })
}
```

---

## 4. Window State Persistence

```rust
// src-tauri/src/commands/window.rs

use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Serialize, Deserialize)]
pub struct WindowState {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub fullscreen: bool,
    pub sidebar_collapsed: bool,
    pub sidebar_width: f64,
    pub active_site: String,
    pub open_sites: Vec<String>,
}

fn state_path() -> std::path::PathBuf {
    let mut path = dirs::data_dir().unwrap_or_default();
    path.push("ai.sgraph.desktop");
    fs::create_dir_all(&path).ok();
    path.push("window-state.json");
    path
}

#[tauri::command]
pub async fn save_window_state(state: WindowState) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Serialize failed: {}", e))?;
    fs::write(state_path(), json)
        .map_err(|e| format!("Write failed: {}", e))
}

#[tauri::command]
pub async fn load_window_state() -> Result<WindowState, String> {
    let path = state_path();
    if !path.exists() {
        return Ok(WindowState {
            x: 100.0, y: 100.0,
            width: 1200.0, height: 800.0,
            fullscreen: false,
            sidebar_collapsed: false,
            sidebar_width: 60.0,
            active_site: "send".to_string(),
            open_sites: vec!["send".to_string()],
        });
    }
    let json = fs::read_to_string(path)
        .map_err(|e| format!("Read failed: {}", e))?;
    serde_json::from_str(&json)
        .map_err(|e| format!("Parse failed: {}", e))
}
```

---

## 5. Local App Shell (Frontend)

### index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SGraph Desktop</title>
    <link rel="stylesheet" href="/assets/styles/reset.css">
    <link rel="stylesheet" href="/assets/styles/theme.css">
    <link rel="stylesheet" href="/app-shell/latest/app-shell.css">
</head>
<body>
    <sg-app-shell></sg-app-shell>

    <script type="module">
        import '/app-shell/latest/app-shell.js'
    </script>
</body>
</html>
```

### app-shell.js (Main Shell Component)

```javascript
// src/app-shell/v0.1.0/app-shell.js

import '/sidebar/latest/sidebar.js'
import '/status-bar/latest/status-bar.js'
import { SiteManager } from '/lib/site-manager.js'
import { EventBus } from '/lib/event-bus.js'

class SgAppShell extends HTMLElement {
    constructor() {
        super()
        this._siteManager = new SiteManager()
    }

    connectedCallback() {
        this.innerHTML = `
            <div class="app-shell">
                <sg-sidebar></sg-sidebar>
                <main class="app-content" id="webview-container">
                    <!-- Tauri webviews are injected here by Rust -->
                    <div class="welcome-screen">
                        <h1>SGraph Desktop</h1>
                        <p>Select a site from the sidebar to get started.</p>
                    </div>
                </main>
                <sg-status-bar></sg-status-bar>
            </div>
        `

        EventBus.on('site-selected', (e) => this._onSiteSelected(e.detail))
        this._restoreState()
    }

    async _restoreState() {
        const state = await window.__TAURI__.core.invoke('load_window_state')
        if (state.active_site) {
            EventBus.emit('site-selected', { siteId: state.active_site })
        }
    }

    _onSiteSelected(detail) {
        // Hide welcome screen, show webview for the selected site
        const welcome = this.querySelector('.welcome-screen')
        if (welcome) welcome.style.display = 'none'

        this._siteManager.activate(detail.siteId)
    }
}

customElements.define('sg-app-shell', SgAppShell)
```

### sidebar.js

```javascript
// src/sidebar/v0.1.0/sidebar.js

import { EventBus } from '/lib/event-bus.js'

const SITE_ICONS = {
    send:      '<svg>...</svg>',
    vault:     '<svg>...</svg>',
    workspace: '<svg>...</svg>',
    tools:     '<svg>...</svg>',
}

class SgSidebar extends HTMLElement {
    constructor() {
        super()
        this._activeSite = null
    }

    connectedCallback() {
        this.innerHTML = `
            <nav class="sidebar">
                <div class="sidebar-sites">
                    ${this._renderSites()}
                </div>
                <div class="sidebar-bottom">
                    <button class="sidebar-btn" data-action="settings" title="Settings">
                        <svg><!-- gear icon --></svg>
                    </button>
                </div>
            </nav>
        `

        this.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-site]')
            if (btn) {
                this._selectSite(btn.dataset.site)
            }
            const action = e.target.closest('[data-action]')
            if (action) {
                EventBus.emit('action', { action: action.dataset.action })
            }
        })
    }

    _renderSites() {
        return Object.entries(SITE_ICONS).map(([id, icon]) => `
            <button class="sidebar-btn" data-site="${id}" title="${id}">
                ${icon}
            </button>
        `).join('')
    }

    _selectSite(siteId) {
        this._activeSite = siteId
        this.querySelectorAll('[data-site]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.site === siteId)
        })
        EventBus.emit('site-selected', { siteId })
    }
}

customElements.define('sg-sidebar', SgSidebar)
```

---

## 6. Keychain Bridge (JS → Rust)

```javascript
// src/lib/keychain-bridge.js

const { invoke } = window.__TAURI__.core

/**
 * Store a value in the macOS keychain
 * @param {string} service - Service name (e.g., 'sgraph-send')
 * @param {string} account - Account name (e.g., 'access-token')
 * @param {string} value - Value to store
 */
export async function keychainSet(service, account, value) {
    return invoke('keychain_set', { service, account, value })
}

/**
 * Retrieve a value from the macOS keychain
 * @param {string} service - Service name
 * @param {string} account - Account name
 * @returns {Promise<string|null>} The stored value or null
 */
export async function keychainGet(service, account) {
    return invoke('keychain_get', { service, account })
}

/**
 * Delete a value from the macOS keychain
 * @param {string} service - Service name
 * @param {string} account - Account name
 */
export async function keychainDelete(service, account) {
    return invoke('keychain_delete', { service, account })
}
```

---

## 7. Event Bus (Cross-Component Communication)

```javascript
// src/lib/event-bus.js

/**
 * Simple event bus for cross-component communication.
 * Same pattern as the SG/Send workspace EventBus.
 */
export const EventBus = {
    _target: new EventTarget(),

    /**
     * Emit an event
     * @param {string} type - Event name
     * @param {*} detail - Event payload
     */
    emit(type, detail) {
        this._target.dispatchEvent(new CustomEvent(type, { detail }))
    },

    /**
     * Listen for an event
     * @param {string} type - Event name
     * @param {function} handler - Event handler
     */
    on(type, handler) {
        this._target.addEventListener(type, handler)
    },

    /**
     * Remove an event listener
     * @param {string} type - Event name
     * @param {function} handler - Event handler to remove
     */
    off(type, handler) {
        this._target.removeEventListener(type, handler)
    }
}
```

---

## 8. Workspace Shell Reference Pattern

The existing workspace-shell.js from SG/Send is the closest architectural reference for the desktop app shell. Key patterns to reuse:

```javascript
// From sgraph_ai_app_send__ui__workspace — patterns to follow:

// 1. Web Component with connectedCallback / disconnectedCallback
class WorkspaceShell extends HTMLElement {
    connectedCallback()    { this._render(); this._bindEvents() }
    disconnectedCallback() { this._unbindEvents() }
}

// 2. Preferences via persistent storage
_loadPreferences() { /* localStorage in web, keychain in desktop */ }
_savePreferences() { /* same */ }

// 3. Panel show/hide with state tracking
_togglePanel(panel) {
    this[`_${panel}Open`] = !this[`_${panel}Open`]
    this._savePreferences()
    this._updateLayout()
}

// 4. Five-zone CSS Grid layout
// (desktop app uses a simpler sidebar + content layout)
```

The desktop app shell is simpler than the workspace shell: sidebar (narrow, icon-only) + content area (webview). No resize handles, no debug panel. The complexity lives in the web apps loaded in the webviews.
