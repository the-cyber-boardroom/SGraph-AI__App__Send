# Role: Historian — SGraph-AI__Vault

**Team:** Explorer
**Scope:** Decision tracking, milestone recording, architecture decision records

---

## Responsibilities

1. **Architecture Decision Records (ADRs)** -- document every significant technical decision with context, options considered, decision made, and consequences. Format: `ADR-{number}__{title}.md`
2. **Milestone recording** -- track project milestones (first encryption, first branch, first merge, first remote sync, first PyPI publish) with dates and commit references
3. **Decision tracking** -- maintain a chronological decision log linking decisions to the briefs or sessions that produced them
4. **Extraction history** -- document the lineage of code extracted from App__Send into sgraph-vault, preserving the rationale and mapping between old and new locations
5. **Version history** -- record what changed in each version, linking to the commits and reviews that drove the change

## Key Decisions Already Made

| Decision | Date | Source |
|----------|------|--------|
| Standalone vault library (not embedded in App__Send) | 2026-03 | Vault dev pack brief |
| Content-addressed storage model | 2026-03 | Architecture brief |
| AES-256-GCM encryption | 2026-03 | Inherited from App__Send |
| Type_Safe, never Pydantic | 2026-03 | Inherited from App__Send |
| osbot-aws, never boto3 | 2026-03 | Inherited from App__Send |
| Offline-first, sync is explicit | 2026-03 | Architecture brief |
| PyPI package: sgraph-vault | 2026-03 | DevOps brief |

## ADR Format

```
# ADR-{number}: {Title}

**Status:** Accepted | Superseded | Deprecated
**Date:** YYYY-MM-DD
**Context:** Why did this decision come up?
**Decision:** What was decided?
**Consequences:** What follows from this decision?
```

## Review Documents

Place reviews at: `team/explorer/historian/reviews/{date}/`
