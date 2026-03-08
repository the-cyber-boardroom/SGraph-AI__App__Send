# What to Clone from SG/Send Main Repo

**Version:** v0.12.2

The desktop project is a standalone repo, but it references briefs, code patterns, and architecture from the SG/Send main repo. Clone it for read access.

---

## How to Access

```bash
git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref
```

---

## What to READ (Reference Only)

These files define the requirements and patterns to follow:

### Source Briefs (the requirements)

| What | Path | Why |
|------|------|-----|
| **Web Components Architecture** | `team/humans/dinis_cruz/briefs/03/07/v0.12.2__dev-brief__web-components-architecture.md` | Part 4: Desktop App Exploration — primary source brief |
| **sg-layout Architecture** | `team/humans/dinis_cruz/briefs/03/07/v0.11.25__arch-brief__sg-layout-framework-architecture.md` | Layout framework the desktop app will reuse |
| **sg-layout Implementation** | `team/humans/dinis_cruz/briefs/03/07/v0.11.25__dev-brief__sg-layout-implementation-plan.md` | Implementation plan for sg-layout |
| **Chrome Extension Key Vault** | `team/humans/dinis_cruz/briefs/03/04/v0.11.1__dev-brief__chrome-extension-key-vault.md` | Related: key storage approach |

### Component Patterns (to understand before building)

| What | Path | Why |
|------|------|-----|
| **workspace-shell.js** | `sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/components/workspace-shell/workspace-shell.js` | Shell/panel architecture pattern |
| **send-header.js** | `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/components/send-header/send-header.js` | Header component pattern |
| **send-footer.js** | `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/components/send-footer/send-footer.js` | Footer component pattern |
| **event-bus.js** | `sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/components/workspace-shell/workspace-shell.js` | EventBus pattern (inside workspace) |

### Dev Pack (sibling project for structure reference)

| What | Path | Why |
|------|------|-----|
| **Tools dev pack** | `library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/` | Same team structure, same dev pack format |
| **This dev pack** | `library/sgraph-send/dev_packs/v0.12.2__desktop-sgraph-ai/` | The bootstrap pack you're reading |

### Architecture References

| What | Path | Why |
|------|------|-----|
| **IFD guide** | `library/guides/development/ifd/v1.2.1__ifd__intro-and-how-to-use.md` | IFD methodology |
| **Main CLAUDE.md** | `.claude/CLAUDE.md` | SG/Send project conventions (for reference) |

---

## What to COPY (Into Desktop Repo)

| What | Source | Destination | Why |
|------|--------|-------------|-----|
| CLAUDE.md template | This dev pack `claude-md-templates/CLAUDE.md` | `.claude/CLAUDE.md` | Project guidance |
| Explorer CLAUDE.md | This dev pack `claude-md-templates/explorer__CLAUDE.md` | `.claude/explorer/CLAUDE.md` | Team instructions |
| Role definitions | This dev pack `03_role-definitions/` | `team/explorer/{role}/ROLE__{name}.md` | Role setup |
| EventBus pattern | workspace-shell.js EventBus | `src/lib/event-bus.js` | Cross-component communication |
| CSS theme variables | SG/Send Aurora theme | `src/assets/styles/theme.css` | Visual consistency |

---

## What NOT to Copy

- **Python code** — desktop app has no Python
- **Lambda code** — no server-side code
- **FastAPI / osbot-* code** — not applicable (Tauri/Rust project)
- **Web app source** — desktop loads *.sgraph.ai URLs in webviews, doesn't bundle web apps
- **crypto.js** — encryption happens in the web apps, not in the desktop shell
- **api-client.js** — API calls happen in the web apps, not in the desktop shell
- **Test infrastructure** — Python pytest, not applicable (Rust tests + Tauri test utils)
- **S3/CloudFront config** — desktop distributes via GitHub releases, not CDN
