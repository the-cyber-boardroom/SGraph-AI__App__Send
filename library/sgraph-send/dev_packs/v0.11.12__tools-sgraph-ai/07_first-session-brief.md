# First Session Brief

**Version:** v0.11.12
**Date:** 5 March 2026
**Purpose:** Orientation for the first Claude Code session on the sgraph_ai__tools repo

---

## Who You Are

You are the **Explorer team** for the sgraph_ai__tools project. You have 6 roles: Architect, Dev, Designer, DevOps, Librarian, Historian.

## What You're Building

A canonical component library and standalone tool platform for the SGraph ecosystem. Three tiers:

- **core/** — Pure JS modules (crypto, API client, LLM client, video processing)
- **components/** — Reusable UI elements (header, footer, upload-dropzone, file-preview)
- **tools/** — Standalone single-page browser tools (video splitter, SSH keygen, LLM client)

All other SGraph projects (send.sgraph.ai, vault.sgraph.ai, workspace, chrome extension) will import shared logic from tools.sgraph.ai. This eliminates code duplication.

## What You Already Know

The architecture has been designed. Read the briefs in the SG/Send main repo:

```
/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/05/v0.11.08__arch-brief__tools-canonical-component-library.md
/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/05/v0.11.08__dev-brief__tools-sgraph-video-splitter.md
/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/05/v0.11.08__dev-brief__tools-briefing-pack.md
```

Key decisions are already made (see `03_role-definitions/ROLE__historian.md` for the full list).

## Your First Session Goals

**Repo structure first. Team setup second. Crypto extraction third. First tool fourth.**

### Session 1 Deliverables

1. **Repo skeleton** — three-tier directory structure, version file
2. **CLAUDE.md files** — main + explorer team (adapt from templates in `09_claude-md-review.md`)
3. **Team structure** — `team/explorer/{role}/` with README.md + ROLE files for all 6 roles
4. **BRIEF_PACK.md** — 10-section session bootstrap document at `briefs/BRIEF_PACK.md`
5. **Reality document** — initial `team/explorer/librarian/reality/v0.1.0__what-exists-today.md`
6. **crypto.js extraction** — `core/crypto/v1.0.0/sg-crypto.js` converted from send repo
7. **Landing page** — `tools/index.html` with tool directory
8. **At least one working tool** — SSH Key Generator migrated or Video Splitter built
9. **CDN import verification** — confirm external page can import from tools.sgraph.ai

### Reading Order

1. This file (you're reading it)
2. `BRIEF.md` — full briefing with phases, constraints, specifications
3. `architecture.md` — three-tier structure, module API contracts, versioning
4. `code-context.md` — source code to extract (crypto, api-client, llm, etc.)
5. `05_technical-bootstrap-guide.md` — step-by-step repo setup
6. `06_what-to-clone.md` — what to reference from the SG/Send main repo

Then read the role definitions:
7. `03_role-definitions/ROLE__architect.md`
8. `03_role-definitions/ROLE__dev.md`
9. `03_role-definitions/ROLE__designer.md`
10. `03_role-definitions/ROLE__devops.md`
11. `03_role-definitions/ROLE__librarian.md`
12. `03_role-definitions/ROLE__historian.md`

And the architecture brief from the SG/Send main repo:
13. `/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/05/v0.11.08__arch-brief__tools-canonical-component-library.md`
14. `/tmp/sgraph-send-ref/team/humans/dinis_cruz/briefs/03/05/v0.11.08__dev-brief__tools-sgraph-video-splitter.md`

And the CLAUDE.md templates:
15. `09_claude-md-review.md`

And the source code to extract:
16. `/tmp/sgraph-send-ref/sgraph_ai_app_send__ui__user/v0/v0.2/v0.2.0/_common/js/crypto.js`
17. `/tmp/sgraph-send-ref/sgraph_ai_app_send__ui__workspace/v0/v0.1/v0.1.0/components/llm-chat/llm-chat.js`

## Critical Reminders

- **Vanilla JS only.** No React, no Vue, no frameworks. ES modules everywhere.
- **No build step.** Every file deployable as-is.
- **Named exports only.** No default exports.
- **JSDoc on every export.** `@param` types and `@returns`.
- **Team structure before features.** CLAUDE.md, roles, BRIEF_PACK.md before writing tool code.
- **Client-side only.** Zero server calls from tools.
- **No localStorage.** In-memory state unless explicitly documented.
