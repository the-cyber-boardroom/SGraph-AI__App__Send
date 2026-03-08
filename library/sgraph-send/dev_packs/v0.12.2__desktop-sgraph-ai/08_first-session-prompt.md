# First Session Prompt

**Version:** v0.12.2
**Date:** 8 March 2026
**Purpose:** Copy-paste this into the first Claude Code session for the desktop project

---

## The Prompt

Copy everything below the line and paste it as your first message in a new Claude Code session:

---

```
You are bootstrapping a brand new project: **SGraph-AI__Desktop** — a Tauri-based macOS desktop application that provides native access to the SGraph ecosystem websites.

This is a standalone project (separate repo) that provides:
- **App shell** — Sidebar + webview container wrapping *.sgraph.ai websites
- **Multi-site launcher** — Switch between Send, Vault, Workspace, Tools in a single native app
- **Native macOS integration** — Keychain for secrets, Dock icon, menu bar, file associations

The desktop app does NOT bundle the web apps. It loads *.sgraph.ai URLs in native webviews (WebKit). The Rust backend handles macOS-specific operations (keychain, file system, window management).

## Step 1: Read the bootstrap pack

The bootstrap pack lives in the SG/Send main repo. Clone it (read-only) and read the documents in order:


git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref


Read these files from the cloned repo, in this order:

1. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/README.md` — index of all bootstrap documents
2. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/07_first-session-brief.md` — your orientation
3. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/BRIEF.md` — full briefing
4. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/architecture.md` — Tauri architecture, IPC, webviews
5. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/code-context.md` — Rust boilerplate, JS components
6. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/05_technical-bootstrap-guide.md` — step-by-step setup
7. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/06_what-to-clone.md` — what to reference from SG/Send

Also read the role definitions:
8. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/03_role-definitions/ROLE__architect.md`
9. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/03_role-definitions/ROLE__dev.md`
10. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/03_role-definitions/ROLE__designer.md`
11. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/03_role-definitions/ROLE__devops.md`
12. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/03_role-definitions/ROLE__librarian.md`
13. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/03_role-definitions/ROLE__historian.md`

And the source brief:
14. `/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/07/v0.12.2__dev-brief__web-components-architecture.md`

And the CLAUDE.md templates:
15. `/tmp/sgraph-send-ref/library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/09_claude-md-review.md`

And the workspace shell pattern (reference for the app shell):
16. `/tmp/sgraph-send-ref/sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/components/workspace-shell/workspace-shell.js`

## Step 2: Create the repo

After reading all documents, your first task is:

1. Create the SGraph-AI__Desktop repo with Tauri v2 project structure
2. Create `.claude/CLAUDE.md` and `.claude/explorer/CLAUDE.md` for the new repo (from templates)
3. Create `team/explorer/{role}/` directories with README.md + ROLE__{name}.md for each of the 6 roles
4. Create `briefs/BRIEF_PACK.md` with all 10 sections populated
5. Create initial reality document at `team/explorer/librarian/reality/v0.1.0__what-exists-today.md`
6. Build the app shell: sidebar with site icons, webview container
7. Load send.sgraph.ai in a webview inside the app
8. Set up macOS Dock icon and basic menu bar
9. Verify `cargo tauri dev` launches the app successfully

You are operating as the **Explorer team** with 6 roles: Architect, Dev, Designer, DevOps, Librarian, Historian. Team structure first, then Tauri project, then app shell.

**Non-negotiable:** Tauri v2 (not v1). macOS first (arm64). Vanilla JS for local UI. Rust for native ops. Remote webviews (load URLs, don't bundle). No telemetry.
```
