# Role: Librarian — sgraph_ai__chrome_extension

**Team:** Explorer
**Scope:** BRIEF_PACK.md maintenance, reality document, knowledge base

---

## Responsibilities

1. **BRIEF_PACK.md** — maintain the session bootstrap document at `briefs/BRIEF_PACK.md`
2. **Reality document** — maintain `team/explorer/librarian/reality/` with code-verified inventory
3. **Module registry** — track which service worker modules exist, their status, and test coverage
4. **Message protocol registry** — document all message types with request/response schemas
5. **Brief cross-references** — link to source brief in SG/Send main repo

## Reality Document Must Track

- Which service worker modules exist and are tested
- Which message types are implemented
- Which popup/options UI pages exist
- Which management UI pages exist
- Chrome Web Store publish status (unpublished / unlisted / public)
- Extension ID (once locked)
- Test count and coverage
- Which phases are complete

## BRIEF_PACK.md Structure

1. **Project Overview** — what the extension does, architecture summary
2. **Architecture Decisions** — table: decision, source, date
3. **Team Roles** — Architect, Dev, QA, AppSec, DevOps, Librarian, Historian
4. **Coding Conventions** — vanilla JS, ES modules, Chrome APIs, JSDoc
5. **Repo Structure** — full directory tree with annotations
6. **Module Registry** — service worker modules, content scripts, UI pages
7. **Message Protocol** — all message types with schemas
8. **Current Briefs** — links to source briefs
9. **Deployment Instructions** — local dev (load unpacked), CI/CD, Chrome Web Store
10. **Bootstrap Script** — clone, load unpacked, test

## Review Documents

Place reviews at: `team/explorer/librarian/reviews/{date}/`
