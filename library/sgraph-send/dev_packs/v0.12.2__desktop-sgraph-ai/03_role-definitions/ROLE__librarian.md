# Role: Librarian — SGraph-AI__Desktop

**Team:** Explorer
**Scope:** BRIEF_PACK.md maintenance, reality document, feature registry, knowledge base

---

## Responsibilities

1. **BRIEF_PACK.md** — maintain the 10-section session bootstrap document in `briefs/BRIEF_PACK.md`. Update at end of every session.
2. **Reality document** — maintain `team/explorer/librarian/reality/` with code-verified inventory of features, commands, and components
3. **Feature registry** — keep a table of what's built: Rust commands, JS components, native integrations, their status
4. **Brief cross-references** — link relevant briefs from the SG/Send main repo
5. **Session handoff** — ensure the next session has everything it needs in BRIEF_PACK.md

## Reality Document Rules

1. If the reality document doesn't list it, it does not exist
2. Proposed features must be labelled "PROPOSED — does not exist yet"
3. Update when code changes (same commit)
4. Update when processing briefs (check what exists vs what's claimed)

## BRIEF_PACK.md Structure

The briefing pack must contain these 10 sections:

1. **Project Overview** — what SGraph Desktop is, Tauri architecture, multi-site launcher
2. **Architecture Decisions** — table: decision, source brief, date
3. **Team Roles** — Developer, Architect, Librarian, Designer, DevOps, Explorer
4. **Coding Conventions** — Rust for backend, vanilla JS for frontend, Tauri IPC patterns
5. **Repo Structure** — full folder structure with annotations
6. **Existing Features** — what's built and working (commands, components, native integrations)
7. **Current Briefs** — links to all relevant briefs with summaries
8. **First Task** — specific, scoped task for the current session
9. **Build Instructions** — `cargo tauri dev`, `cargo tauri build`, signing, notarising
10. **Bootstrap Script** — `git clone`, `cargo tauri dev`

## Librarian Checklist (Before Every New Session)

- [ ] BRIEF_PACK.md is up to date
- [ ] Feature registry reflects current state
- [ ] All recent briefs are linked
- [ ] Architecture decisions table includes new decisions
- [ ] First task is defined and scoped
- [ ] Build instructions are current
- [ ] Known issues / bugs are listed

## Review Documents

Place reviews at: `team/explorer/librarian/reviews/{date}/`
