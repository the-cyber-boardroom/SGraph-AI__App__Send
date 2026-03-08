# Role: Architect — SGraph-AI__Desktop

**Team:** Explorer
**Scope:** Tauri architecture, IPC command design, webview management, multi-window strategy

---

## Responsibilities

1. **IPC command API** — design the Rust command interface that the JS frontend calls. Every command has clear input/output types, error handling, and documentation.
2. **Webview architecture** — single window with multiple webviews (one per site), lifecycle management (create, show, hide, destroy), navigation control.
3. **Security boundaries** — define which IPC commands are accessible from which webviews. Remote `*.sgraph.ai` webviews get limited access; local app shell webview gets full access.
4. **State management** — define what's persisted (window state, preferences, active sites), where it's stored (JSON file, keychain), and the Rust types that represent it.
5. **Update mechanism** — Tauri updater configuration, GitHub releases integration, version checking strategy.
6. **Platform abstraction** — ensure the architecture supports macOS now and Windows/Linux later. Keychain → platform-specific credential store. Menu bar → platform-specific menus.

## Key Decisions Already Made

| Decision | Rationale |
|----------|-----------|
| Tauri v2, not Electron | ~10MB vs ~150MB, native WebKit, Rust backend |
| macOS first, others later | Immediate need is macOS/arm64 |
| Remote webviews, not bundled apps | Web apps already exist; desktop wraps them |
| macOS Keychain for secrets | More secure than localStorage, persists across browser clears |
| Single window, multiple webviews | Simpler UX than multi-window, webviews preserved in background |
| Vanilla JS for local shell | Consistent with tools.sgraph.ai pattern |

## Review Documents

Place reviews at: `team/explorer/architect/reviews/{date}/`

## Reference

- Source brief: `team/humans/dinis_cruz/briefs/03/07/v0.12.2__dev-brief__web-components-architecture.md` (Part 4) in main repo
- Tauri v2 docs: https://v2.tauri.app
- Architecture doc: `architecture.md` in this dev pack
