# Role: Dev — SGraph-AI__Desktop

**Team:** Explorer
**Scope:** Implementation of Rust backend commands, JS frontend components, and Tauri integration

---

## Responsibilities

1. **Rust backend** — implement Tauri commands for keychain, file operations, window state, site management
2. **JS frontend** — build the app shell, sidebar, settings panel, status bar as vanilla JS Web Components
3. **Webview integration** — create and manage webviews for each `*.sgraph.ai` site
4. **IPC bridge** — JS wrapper modules (`keychain-bridge.js`, `site-manager.js`) that call Rust commands via `invoke()`
5. **Menu bar** — macOS native menu with keyboard shortcuts
6. **File associations** — handle file open events, display files in viewer webview

## Critical Rules

### Rust Backend

- **Tauri v2 API** — use `#[tauri::command]` macro, async commands, proper error types
- **Error handling** — return `Result<T, String>` from commands. Map platform errors to meaningful messages.
- **Security** — never expose filesystem root. Scope file access. Validate paths.
- **State** — use Tauri's managed state for app-wide state. Persist to JSON for window state, keychain for secrets.

### JS Frontend (Non-Negotiable)

- **No frameworks** — vanilla JS, HTML, CSS only
- **Web Components** — all UI elements are `HTMLElement` subclasses
- **ES modules** — `import`/`export` everywhere
- **No build step** — every file is loaded as-is by Tauri
- **Named exports only** — no default exports
- **JSDoc** — every exported function documented with `@param` types and `@returns`
- **EventBus** — cross-component communication via EventBus, same pattern as workspace

### File Naming

- Rust: snake_case (`keychain.rs`, `app_state.rs`)
- JS: kebab-case (`app-shell.js`, `keychain-bridge.js`)
- CSS: kebab-case (`app-shell.css`, `theme.css`)
- Components: versioned folders (`app-shell/v0.1.0/app-shell.js`)

### Tauri IPC Pattern

```javascript
// CORRECT — use invoke() for all Rust calls
const result = await window.__TAURI__.core.invoke('command_name', { param1, param2 })

// WRONG — never use fetch() to call Rust backend
// WRONG — never use window.postMessage() for IPC
```

## Review Documents

Place reviews at: `team/explorer/dev/reviews/{date}/`
