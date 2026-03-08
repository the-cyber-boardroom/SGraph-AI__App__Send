# Technical Bootstrap Guide

**Version:** v0.12.2
**Purpose:** Step-by-step instructions for setting up the SGraph-AI__Desktop repo from scratch.

---

## Phase 0: Prerequisites

### Required Tools

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add aarch64-apple-darwin   # Apple Silicon
rustup target add x86_64-apple-darwin    # Intel (for universal binary)

# Xcode Command Line Tools (macOS — required for WebKit framework)
xcode-select --install

# Tauri CLI
cargo install tauri-cli

# Node.js (for Tauri's frontend tooling — optional but recommended)
# Already available if you have the SG/Send dev environment
```

### Clone Reference Repo

```bash
git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref
```

You need this to:
- Read the source briefs (web components architecture, sg-layout, chrome extension key vault)
- Reference the workspace shell component pattern
- Reference the dev pack structure (tools-sgraph-ai)

---

## Phase 1: Repo Skeleton (DO THIS FIRST)

### 1.1 Create Tauri Project

```bash
# Create new Tauri v2 project
cargo create-tauri-app SGraph-AI__Desktop --template vanilla

# Or manually:
mkdir SGraph-AI__Desktop && cd SGraph-AI__Desktop
cargo tauri init
```

### 1.2 Adapt Project Structure

Reorganise from Tauri's default to match the SGraph team structure:

```
SGraph-AI__Desktop/
├── .claude/
│   ├── CLAUDE.md
│   └── explorer/
│       └── CLAUDE.md
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   └── commands/
│   │       ├── mod.rs
│   │       ├── keychain.rs
│   │       ├── files.rs
│   │       ├── window.rs
│   │       └── sites.rs
│   ├── sgraph-sites.json
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   ├── icons/
│   └── capabilities/
│       └── default.json
├── src/
│   ├── index.html
│   ├── app-shell/
│   │   └── v0.1.0/
│   ├── sidebar/
│   │   └── v0.1.0/
│   ├── status-bar/
│   │   └── v0.1.0/
│   ├── lib/
│   │   ├── keychain-bridge.js
│   │   ├── site-manager.js
│   │   ├── window-state.js
│   │   └── event-bus.js
│   └── assets/
│       ├── icons/
│       └── styles/
├── briefs/
│   └── BRIEF_PACK.md
├── team/
│   └── explorer/
│       ├── architect/
│       ├── dev/
│       ├── designer/
│       ├── devops/
│       ├── librarian/
│       │   └── reality/
│       └── historian/
├── version
└── README.md
```

### 1.3 Create Version File

```bash
echo "v0.1.0" > version
```

### 1.4 Create CLAUDE.md Files

Copy from `claude-md-templates/` in this dev pack:
- `CLAUDE.md` → `.claude/CLAUDE.md`
- `explorer__CLAUDE.md` → `.claude/explorer/CLAUDE.md`

### 1.5 Create Team Structure

For each of the 6 roles (architect, dev, designer, devops, librarian, historian):

1. Create directory: `team/explorer/{role}/`
2. Create `README.md` with: role name, one-line description, link to ROLE file
3. Copy `ROLE__{name}.md` from `03_role-definitions/` in this dev pack
4. Create `reviews/` directory

### 1.6 Create Initial Reality Document

```markdown
# SGraph Desktop — What Exists Today (v0.1.0)

**Last verified:** {date}

## Application
- [ ] Tauri project compiles
- [ ] App launches on macOS
- [ ] Basic window with webview

## Rust Commands
None yet.

## Frontend Components
None yet.

## Native Integration
- [ ] macOS keychain
- [ ] File associations
- [ ] Menu bar
- [ ] Auto-update

## Infrastructure
- [ ] CI/CD pipeline
- [ ] Code signing
- [ ] Notarisation
- [ ] DMG distribution

## PROPOSED — Does Not Exist Yet
- Multi-site webview switching (planned Phase 2)
- Keychain integration (planned Phase 2)
- File associations (planned Phase 3)
- Auto-update (planned Phase 4)
```

---

## Phase 2: Basic App Shell

### 2.1 Configure tauri.conf.json

Set up the Tauri configuration as specified in `architecture.md` (Section 2).

### 2.2 Create Rust Backend

1. Create `src-tauri/src/commands/mod.rs` — module declarations
2. Create initial command files (keychain, files, window, sites) with placeholder implementations
3. Register all commands in `lib.rs`

### 2.3 Create Frontend Shell

1. Create `src/index.html` — main window HTML
2. Create `src/app-shell/v0.1.0/app-shell.js` — shell component
3. Create `src/sidebar/v0.1.0/sidebar.js` — sidebar component
4. Create `src/lib/event-bus.js` — event bus
5. Create `src/assets/styles/theme.css` — CSS custom properties

### 2.4 Build and Test

```bash
cargo tauri dev    # Opens app in dev mode with hot-reload
```

---

## Phase 3: Load First Website

### 3.1 Create Webview for send.sgraph.ai

The webview is created from Rust, not from the frontend. The shell component provides the container; Rust creates the webview inside it.

```rust
// In setup closure:
let main_webview = app.get_webview_window("main").unwrap();

// Create a child webview for send.sgraph.ai
let send_webview = tauri::WebviewBuilder::new(
    "send",
    tauri::WebviewUrl::External("https://send.sgraph.ai".parse().unwrap())
)
.auto_resize();

main_webview.add_child(send_webview, /* position */);
```

### 3.2 Site Registry

Create `src-tauri/sgraph-sites.json`:

```json
{
  "sites": [
    { "id": "send",      "name": "Send",      "url": "https://send.sgraph.ai",      "icon": "send" },
    { "id": "vault",     "name": "Vault",     "url": "https://vault.sgraph.ai",     "icon": "vault" },
    { "id": "workspace", "name": "Workspace", "url": "https://workspace.sgraph.ai", "icon": "workspace" },
    { "id": "tools",     "name": "Tools",     "url": "https://tools.sgraph.ai",     "icon": "tools" }
  ],
  "default": "send"
}
```

---

## Verification Checklist

Before declaring Session 1 complete:

- [ ] `.claude/CLAUDE.md` exists and is comprehensive
- [ ] `.claude/explorer/CLAUDE.md` exists
- [ ] `team/explorer/` has all 6 role directories with README.md + ROLE files
- [ ] `briefs/BRIEF_PACK.md` exists with all 10 sections populated
- [ ] `team/explorer/librarian/reality/` has initial reality document
- [ ] `version` file contains `v0.1.0`
- [ ] `cargo tauri dev` compiles and launches the app
- [ ] App window appears on macOS with sidebar
- [ ] send.sgraph.ai loads in a webview inside the app
- [ ] macOS Dock shows the app icon
