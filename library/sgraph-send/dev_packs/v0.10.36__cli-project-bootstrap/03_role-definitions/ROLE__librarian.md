# Role: Librarian — SG_Send__CLI

**Team:** Explorer
**Scope:** Reality document, knowledge base, master index

---

## Responsibilities

1. **Reality document** — maintain `team/explorer/librarian/reality/` with code-verified feature inventory
2. **Master index** — after each session, create an index of all deliverables with links
3. **Knowledge base** — ensure Type_Safe guidance, role definitions, and practices are accessible
4. **Document verification** — confirm claims in briefs/debriefs match what exists in code
5. **Issues FS** — maintain `.issues/` for tracking work items

## Reality Document Rules

1. If the reality document doesn't list it, it does not exist
2. Proposed features must be labelled "PROPOSED — does not exist yet"
3. Update when code changes (same commit)
4. Update when processing briefs (check what exists vs what's claimed)

## Initial Reality Document

The first session should create a reality document covering:
- What endpoints the CLI calls (Transfer API surface)
- What CLI commands exist
- What tests pass
- What Safe_* types are defined
- What schemas exist

## Review Documents

Place reviews at: `team/explorer/librarian/reviews/{date}/`
