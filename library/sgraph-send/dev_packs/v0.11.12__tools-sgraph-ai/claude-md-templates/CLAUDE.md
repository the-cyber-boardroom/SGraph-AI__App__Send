# sgraph_ai__tools — Agent Guidance

**Read this before starting any task.** This file is the single source of truth for all agents and roles working on sgraph_ai__tools.

---

## MEMORY.md Policy

**Do NOT use MEMORY.md** (the auto-memory at `~/.claude/projects/.../memory/MEMORY.md`). All persistent project knowledge is maintained by the Librarian in the repo itself via `briefs/BRIEF_PACK.md`.

---

## Reality Document — MANDATORY CHECK

**Before describing, assessing, or assuming what tools.sgraph.ai can do, READ:**

`team/explorer/librarian/reality/{version}__what-exists-today.md`

### Rules (Non-Negotiable)

1. **If the reality document doesn't list it, it does not exist.**
2. **Proposed features must be labelled.** Write: "PROPOSED — does not exist yet."
3. **Update the reality document when you change code.** Same commit.

---

## Team Structure: Explorer

This project operates as a single **Explorer team** with 6 roles:

| Role | Responsibility |
|------|---------------|
| **Architect** | Module API design, dependency management, versioning strategy |
| **Dev** | Build tools, extract modules, write tests |
| **Designer** | Consistent tool UX, shared styling, landing page |
| **DevOps** | CI/CD per module, S3 + CloudFront deployment, cache headers |
| **Librarian** | BRIEF_PACK.md, reality document, module registry |
| **Historian** | Decision tracking, session history |

---

## Project

**sgraph_ai__tools** — the canonical component library for the SGraph ecosystem at [tools.sgraph.ai](https://tools.sgraph.ai).

Three tiers: `core/` (pure JS logic), `components/` (reusable UI), `tools/` (standalone pages). All other SGraph projects (send, vault, workspace, chrome extension) import shared logic FROM tools.sgraph.ai.

**Version file:** `version`

---

## Stack

| Layer | Technology | Rule |
|-------|-----------|------|
| Language | Vanilla JavaScript (ES modules) | No frameworks, no build step |
| Modules | ES modules (`import`/`export`) | No CommonJS, no require() |
| Exports | Named exports only | No default exports |
| Components | Web Components (optional) | Light DOM only, no Shadow DOM |
| Styling | Vanilla CSS | CSS custom properties for theming |
| Video | FFmpeg WASM | Client-side only, lazy-loaded |
| LLM | OpenRouter / Ollama APIs | User provides their own API key |
| Crypto | Web Crypto API (AES-256-GCM) | Client-side only |
| Deployment | S3 + CloudFront | Per-module CI/CD |
| Versioning | Folder-based | `v1.0.0/`, `latest/` |

---

## Key Rules

### Code Patterns

1. **No frameworks** — vanilla JS, HTML, CSS only
2. **ES modules** — `import`/`export` everywhere, no CommonJS
3. **No build step** — every file deployable as-is
4. **Named exports only** — no default exports
5. **JSDoc** on every exported function with `@param` types and `@returns`
6. **No localStorage** — use in-memory state (portability to sandboxed contexts)
7. **File naming** — lowercase, hyphens: `sg-video.js`, `upload-dropzone.js`
8. **Core module prefix** — `sg-`: `sg-crypto.js`, `sg-llm.js`, `sg-video.js`

### Security

9. **Client-side only** — zero server calls from tools (except CDN imports and user-initiated LLM calls)
10. **No tracking** — no analytics cookies, no tracking pixels
11. **No secrets in source** — API keys come from user input at runtime

### Versioning

12. **Folder-based** — each module at `{tier}/{name}/v{x.y.z}/{file}`
13. **Independent versions** — a change to crypto doesn't bump api-client
14. **Pinned versions immutable** — content at `/v1.0.0/` never changes
15. **Latest alias** — `/latest/` mirrors the most recent stable version

### Git

16. **Default branch:** `dev`
17. **Feature branches** branch from `dev`
18. **Branch naming:** `claude/{description}-{session-id}`
19. **Always push with:** `git push -u origin {branch-name}`

---

## Role System

Each role produces review documents at `team/explorer/{role}/reviews/`. The Librarian maintains the master index.

**Dinis Cruz** is the human stakeholder. His briefs live in `team/humans/dinis_cruz/briefs/` — **read-only for agents**. Agent outputs go to `team/humans/dinis_cruz/claude-code-web/` or role review folders.

Before starting work, check:
1. **BRIEF_PACK.md** at `briefs/BRIEF_PACK.md` — session bootstrap
2. **Reality document** — what actually exists
3. Latest human brief in `team/humans/dinis_cruz/briefs/`
4. Your role's previous reviews

---

## Key Documents

| Document | Location |
|----------|----------|
| **BRIEF_PACK.md** | `briefs/BRIEF_PACK.md` |
| **Reality document** | `team/explorer/librarian/reality/` |
| **Source briefs** (in SG/Send main repo) | See BRIEF_PACK.md section 7 |
| **Architecture brief** | `v0.11.08__arch-brief__tools-canonical-component-library.md` |
| **Video Splitter brief** | `v0.11.08__dev-brief__tools-sgraph-video-splitter.md` |
| **Briefing pack spec** | `v0.11.08__dev-brief__tools-briefing-pack.md` |
