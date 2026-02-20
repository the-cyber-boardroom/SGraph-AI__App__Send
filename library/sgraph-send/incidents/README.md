# SGraph Send — Incident Register

All security incidents, indexed by incident number. Each incident has a folder pack with a versioned debrief and links to all related documents across the repo.

---

## Incidents

| ID | Date | Description | Severity | Status | Folder |
|----|------|-------------|----------|--------|--------|
| INC-001 | 2026-02-12 | Commit author impersonation | HIGH | Resolved | [INC-001](INC-001__2026-02-12__commit-author-impersonation/v0.4.16__debrief__commit-author-impersonation.md) |
| INC-002 | 2026-02-17 | First external security disclosure (29 findings) | P3-as-P1 | In progress | [INC-002](INC-002__2026-02-17__first-external-security-disclosure/BRIEF.md) |
| INC-003 | 2026-02-19 | Access token leak in shareable URLs | P4-as-P1 | Resolved | [INC-003](INC-003__2026-02-19__access-token-leak-in-urls/v0.4.16__debrief__access-token-leak-in-urls.md) |
| INC-004 | 2026-02-19 | Documentation token leak (data breach) | P2-as-P1 | Closed | [INC-004](INC-004__2026-02-19__documentation-token-leak/v0.4.16__debrief__documentation-token-leak.md) |

## Summary

| Metric | Count |
|--------|:-----:|
| Total incidents | 4 |
| Data breaches | 1 (INC-004) |
| ICO notifications | 0 |
| User data compromised | **0** |

## Folder Naming Convention

```
INC-{NNN}__{YYYY-MM-DD}__{short-description}/
    v{version}__debrief__{incident-name}.md   — Versioned debrief with summary and links to all source documents
    {sub-packs}/                               — Optional sub-folders for grouped findings (e.g., INC-002)
```

## Cross-References

- **Incident attribution leaderboard:** `team/roles/historian/reviews/26-02-19/v0.4.16__leaderboard__incident-attribution.md`
- **Full-arc narrative (INC-003 + INC-004):** `team/roles/journalist/reviews/26-02-19/v0.4.16__article__from-leak-to-feature-full-arc.md`
