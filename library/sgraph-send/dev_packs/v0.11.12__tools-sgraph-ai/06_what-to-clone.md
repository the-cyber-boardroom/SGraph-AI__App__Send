# What to Clone from SG/Send Main Repo

**Version:** v0.11.12

The tools project is a standalone repo, but it references source code and briefs from the SG/Send main repo. Clone it for read access.

---

## How to Access

```bash
git clone https://github.com/the-cyber-boardroom/SGraph-AI__App__Send.git /tmp/sgraph-send-ref
```

---

## What to READ (Reference Only)

These files define the source code to extract and the architecture to follow:

### Source Code (modules to extract)

| What | Path | Why |
|------|------|-----|
| **crypto.js** | `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/crypto.js` | First module to extract — AES-256-GCM |
| **api-client.js** | `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/api-client.js` | REST client for Transfer API |
| **i18n.js** | `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/i18n.js` | Internationalisation module |
| **file-type-detect.js** | `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/file-type-detect.js` | MIME detection |
| **markdown-parser.js** | `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/markdown-parser.js` | Safe markdown to HTML |
| **llm-chat.js** | `sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/components/llm-chat/llm-chat.js` | LLM client logic to extract |
| **llm-connection.js** | `sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/components/llm-connection/llm-connection.js` | Provider config (OpenRouter, Ollama) |
| **workspace-shell.js** | `sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/components/workspace-shell/workspace-shell.js` | IFD component pattern reference |

### Component Patterns (to understand before extracting)

| What | Path | Why |
|------|------|-----|
| **send-upload** | `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/components/send-upload/` | Upload component pattern |
| **send-header** | `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/components/send-header/` | Header component pattern |
| **send-footer** | `sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/components/send-footer/` | Footer component pattern |
| **vault-panel** | `sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/components/vault-panel/` | Vault integration pattern |

### Briefs (the requirements)

| What | Path | Why |
|------|------|-----|
| **Canonical Component Library** | `team/humans/dinis_cruz/briefs/03/05/v0.11.08__arch-brief__tools-canonical-component-library.md` | Full architecture spec |
| **Video Splitter** | `team/humans/dinis_cruz/briefs/03/05/v0.11.08__dev-brief__tools-sgraph-video-splitter.md` | Video tool spec |
| **Briefing Pack Spec** | `team/humans/dinis_cruz/briefs/03/05/v0.11.08__dev-brief__tools-briefing-pack.md` | BRIEF_PACK.md 10-section spec |
| **Daily Brief (5 Mar)** | `team/humans/dinis_cruz/briefs/03/05/v0.11.08__daily-brief__sgraph-send-05-mar-2026.md` | Context and priorities |

### Dev Pack (this pack)

| What | Path | Why |
|------|------|-----|
| **Full dev pack** | `library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/` | This bootstrap pack |

### Architecture References

| What | Path | Why |
|------|------|-----|
| **IFD guide** | `library/guides/development/ifd/v1.2.1__ifd__intro-and-how-to-use.md` | IFD methodology |
| **Main CLAUDE.md** | `.claude/CLAUDE.md` | SG/Send project conventions (for reference) |

---

## What to COPY (Into Tools Repo)

| What | Source Path | Destination | Why |
|------|-----------|-------------|-----|
| crypto.js (converted) | `_common/js/crypto.js` | `core/crypto/v1.0.0/sg-crypto.js` | First core module |
| CI/CD pipeline pattern | `.github/workflows/` | `.github/workflows/` | Adapt for S3 deploy |
| CLAUDE.md template | This dev pack `claude-md-templates/CLAUDE.md` | `.claude/CLAUDE.md` | Project guidance |
| Explorer CLAUDE.md | This dev pack `claude-md-templates/explorer__CLAUDE.md` | `.claude/explorer/CLAUDE.md` | Team instructions |
| Role definitions | This dev pack `03_role-definitions/` | `team/explorer/{role}/ROLE__{name}.md` | Role setup |

---

## What NOT to Copy

- **Python code** — tools repo is pure JS, no Python
- **Lambda code** — no server-side code
- **Pydantic schemas** — no Python schemas
- **osbot-utils, osbot-aws** — not applicable (JS project)
- **Type_Safe guides** — Python-specific, not needed
- **Admin UI** — separate project, not extracted to tools
- **Test infrastructure** — Python pytest, not applicable
