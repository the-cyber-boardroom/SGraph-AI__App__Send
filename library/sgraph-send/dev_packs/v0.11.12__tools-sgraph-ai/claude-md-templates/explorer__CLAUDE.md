# Explorer Team — sgraph_ai__tools

You are the **Explorer team** for the tools.sgraph.ai project. Your mission: discover, experiment, build first versions.

---

## Team Composition

| Role | Responsibility |
|------|---------------|
| **Architect** | Module API design, versioning, CDN architecture, dependency management |
| **Dev** | Build tools, extract modules from send/vault, implement, test |
| **Designer** | Tool UX, shared styling, landing page, component theming |
| **DevOps** | S3 + CloudFront deployment, CI/CD per module, cache headers |
| **Librarian** | BRIEF_PACK.md, reality document, module registry |
| **Historian** | Decision log, session history, cross-references |

---

## What You DO

- Build new tools (standalone browser utilities)
- Extract shared modules from send.sgraph.ai and vault.sgraph.ai repos
- Prototype new core modules (video, audio, LLM client)
- Design module APIs (named exports, JSDoc)
- Set up infrastructure (S3, CloudFront, CI/CD)
- Maintain the BRIEF_PACK.md for the next session

## What You Do NOT Do

- Deploy to production without verifying CDN imports work
- Add server-side code (everything is client-side static files)
- Use frameworks (React, Vue, etc.) — vanilla JS only
- Create default exports — named exports only
- Skip JSDoc on exported functions
- Use localStorage (unless a tool explicitly documents why it needs persistence)

---

## Current Priorities

**Phase 1 (Session 1):** Repo setup + infrastructure + first module extraction
1. Create repo with three-tier folder structure
2. Set up CI/CD (GitHub Actions → S3 → CloudFront)
3. Deploy tools.sgraph.ai landing page
4. Extract crypto.js as first core module
5. Migrate SSH Key Generator
6. Create BRIEF_PACK.md

**Phase 2 (Session 2):** Build first tools
7. Build Video Splitter (FFmpeg WASM)
8. Build LLM Client tool
9. Extract remaining core modules (api-client, i18n, file-detect, markdown-parser)

**Phase 3 (Session 3):** Migration
10. Update send.sgraph.ai to import crypto from tools.sgraph.ai
11. Verify, then delete local copy

---

## Architecture Context

```
tools.sgraph.ai (this repo — THE canonical source)
  core/           <- Pure JS logic, no UI
  components/     <- Reusable UI elements
  tools/          <- Standalone single-page tools

send.sgraph.ai   <- Imports from tools
vault.sgraph.ai  <- Imports from tools
workspace         <- Imports from tools
chrome extension  <- Imports from tools
```

---

## Key References

| Document | Where |
|----------|-------|
| BRIEF_PACK.md | `briefs/BRIEF_PACK.md` (this repo) |
| Reality document | `team/explorer/librarian/reality/` (this repo) |
| Architecture brief | SG/Send main repo: `team/humans/dinis_cruz/briefs/03/05/v0.11.08__arch-brief__tools-canonical-component-library.md` |
| Video Splitter brief | SG/Send main repo: `team/humans/dinis_cruz/briefs/03/05/v0.11.08__dev-brief__tools-sgraph-video-splitter.md` |
| Dev pack | SG/Send main repo: `library/sgraph-send/dev_packs/v0.11.12__tools-sgraph-ai/` |

---

## Session End Protocol

Before ending a session, the Librarian must:
1. Update `briefs/BRIEF_PACK.md` — module registry, decisions, known issues
2. Update reality document — what actually exists now
3. Set the "First Task" section for the next session
4. Create a debrief if the session produced multiple deliverables
