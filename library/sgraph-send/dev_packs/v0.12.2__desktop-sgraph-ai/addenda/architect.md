# Architect Summary for SGraph-AI__Desktop

**Source briefs:**
- `team/humans/dinis_cruz/briefs/03/07/v0.12.2__dev-brief__web-components-architecture.md` (Part 4)
- `team/humans/dinis_cruz/briefs/03/04/v0.11.1__dev-brief__chrome-extension-key-vault.md` (related)

---

## Key Architecture Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| AD-D1 | Tauri v2, not Electron | 15x smaller binary, native WebKit, Rust backend, better security |
| AD-D2 | macOS first (arm64) | Human's primary platform, 80% of immediate use case |
| AD-D3 | Remote webviews, not bundled apps | Web apps are actively developed; bundling creates sync problems |
| AD-D4 | Single window, multiple webviews | Simpler UX than multi-window; background webviews preserve state |
| AD-D5 | macOS Keychain for secrets | System-level security, survives browser clears, per-app isolation |
| AD-D6 | Vanilla JS for local shell | Consistent with SGraph JS ecosystem, no build step |
| AD-D7 | EventBus for component communication | Same pattern as workspace, proven at scale |
| AD-D8 | GitHub Releases for distribution | Standard for open-source, Tauri updater native support |
| AD-D9 | File type associations for .md, .pdf | Key user need: lightweight file viewing without heavy editors |
| AD-D10 | No app-level telemetry | Consistent with SGraph's privacy-first approach |

---

## Multi-Webview Strategy

### Single Window Model

```
┌──────────────────────────────────────────┐
│ SGraph Desktop (single macOS window)     │
│ ┌────┐ ┌───────────────────────────────┐ │
│ │    │ │ Webview: send.sgraph.ai       │ │
│ │ S  │ │ (WebKit process 1)            │ │
│ │ I  │ │                               │ │
│ │ D  │ │ Webview: vault.sgraph.ai      │ │
│ │ E  │ │ (WebKit process 2, hidden)    │ │
│ │ B  │ │                               │ │
│ │ A  │ │ Webview: workspace.sgraph.ai  │ │
│ │ R  │ │ (WebKit process 3, hidden)    │ │
│ │    │ │                               │ │
│ └────┘ └───────────────────────────────┘ │
│ Status bar                               │
└──────────────────────────────────────────┘
```

### Why Not Multi-Window

| Multi-window | Single window + multi-webview |
|-------------|-------------------------------|
| Each site is a macOS window | All sites in one window |
| Cmd+Tab shows all windows | Cmd+Tab shows one app |
| Windows can overlap/get lost | Sidebar ensures easy switching |
| Familiar but cluttered | Clean, focused |
| Window state: complex | Window state: one position |

Multi-window is possible later as an option, but single-window is the default for simplicity.

### Webview Lifecycle

| Event | Action |
|-------|--------|
| First site selection | Create webview, load URL, show |
| Switch to another site | Hide current, create-or-show target |
| Switch back | Show (instant — preserved in memory) |
| App quit | Save which sites were open + positions |
| App relaunch | Recreate webviews for previously open sites |

---

## Platform Abstraction

The architecture must support macOS now and other platforms later:

| Capability | macOS | Windows (future) | Linux (future) |
|-----------|-------|-------------------|-----------------|
| Webview engine | WebKit (system) | WebView2 (Edge) | WebKitGTK |
| Secret storage | Keychain | Windows Credential Manager | libsecret / GNOME Keyring |
| Menu bar | NSMenu | Win32 menu | GTK menu |
| File associations | Info.plist + LSItemContentTypes | Registry | .desktop files |
| Code signing | Apple Developer ID | Authenticode | AppImage (no signing) |
| Auto-update | Tauri updater | Tauri updater | Tauri updater |

The Rust backend abstracts these via trait interfaces. JS frontend code is platform-agnostic — it calls `invoke('keychain_get', ...)` regardless of platform.

---

## Offline Behaviour

| State | Behaviour |
|-------|-----------|
| Online | Webviews load `*.sgraph.ai` normally |
| Offline | Show "No connection" overlay on webviews. Local shell (sidebar, settings) still works. |
| Intermittent | Webviews handle their own retry logic. App shell shows connection indicator. |
| Keychain | Works offline (macOS native) |
| File viewer | Works offline (local files) |

The app does NOT cache `*.sgraph.ai` content. If the user needs offline access, they should use the vault + CLI (separate tool). The desktop app is an access layer, not a sync tool.

---

## Future: sg-layout Integration

Once sg-layout is built (v0.2.0+), the desktop app shell could adopt it:

```
Today:    sidebar (custom CSS) + webview container (full width)
Future:   sg-layout with sidebar zone + multiple content zones
          Enables: side-by-side sites, drag-to-dock panels, fractal nesting
```

This is Phase 5+ territory. The MVP uses a simple sidebar + content layout.
