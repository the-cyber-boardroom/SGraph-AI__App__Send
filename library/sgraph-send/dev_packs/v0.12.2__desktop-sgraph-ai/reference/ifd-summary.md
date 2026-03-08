# IFD Methodology Summary for Tauri Desktop Development

**Source:** `library/guides/development/ifd/v1.2.1__ifd__intro-and-how-to-use.md`

---

## What Is IFD?

**Incremental Feature Development** — a methodology for building software in small, independently deployable increments. Each increment is:

- **Versioned:** Lives in its own versioned folder
- **Isolated:** Changes to one component don't affect others
- **Deployable:** Can go to production independently
- **Testable:** Has its own tests, runs independently

---

## IFD Applied to the Desktop App

### Two-Layer Versioning

The desktop app has two distinct layers that version independently:

#### 1. App Version (Release Versioning)

The overall app version (`v0.1.0`, `v0.2.0`) represents a release:

```
v0.1.0  — Basic shell, single webview (send.sgraph.ai)
v0.2.0  — Multi-site, keychain integration
v0.3.0  — File associations, local viewer
v0.4.0  — Auto-update, code signing
```

This is the version users see, stored in `tauri.conf.json` and `version`.

#### 2. Component Versioning (IFD)

The local JS components use folder-based versioning, same as tools.sgraph.ai:

```
src/app-shell/v0.1.0/app-shell.js     <- app shell at v0.1.0
src/app-shell/v0.2.0/app-shell.js     <- app shell with sidebar improvements
src/sidebar/v0.1.0/sidebar.js         <- sidebar at v0.1.0 (independent of app-shell)
```

A change to the sidebar doesn't require bumping the app-shell version.

### Rust Backend Versioning

Rust code doesn't use folder-based versioning (Cargo handles this). Instead:

- New commands are added to the existing modules
- Breaking changes bump the app version
- Rust tests verify command contracts

---

## IFD Principles Relevant to This Build

1. **Never modify a deployed version** — if `app-shell/v0.1.0/` has a bug, create `v0.1.1/`, don't edit `v0.1.0/`
2. **Each change is a commit** — atomic, reviewable, revertible
3. **Test before release** — `cargo tauri build` must succeed before tagging
4. **Independent component versions** — sidebar v0.1.0 can coexist with app-shell v0.2.0
5. **App release is composition** — a release combines specific component versions and Rust backend state
6. **`latest/` symlinks** — local development uses `latest/` for convenience; releases pin specific versions in `index.html`
