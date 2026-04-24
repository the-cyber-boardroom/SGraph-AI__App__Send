# Issues — Website Repo Extraction

**v0.22.6 | 24 April 2026**

This folder holds task-level issues if the team chooses to use Issues FS tracking for the migration. For a single-agent migration executed in one session, the phase docs are sufficient — issues are optional.

---

## When to add issues here

Add files here if:
- The migration needs to happen across multiple sessions and the team wants to track state between them.
- A deviation from the dev pack occurs that the next agent needs to pick up (e.g. "Phase 3 Step 5 local verification failed; root cause unresolved — see issue file for details").
- Phase 5 cleanup is deferred (e.g. new repo is live but Send repo cleanup is waiting for the 24-hour soak period; issue file tracks "ready to execute cleanup on or after {date}").

## When NOT to add issues here

- For one-shot decisions already captured in the phase docs.
- For questions answered in the `Open Questions` table in this pack's `README.md`.
- For smoke-test results — those go in `MIGRATION-REPORT.md` in the target repo.

---

## File convention

If you add an issue here, name it:

```
{status}__{short-slug}.md
```

Where `{status}` is one of: `open`, `blocked`, `done`. Move files between statuses by renaming.

Example:
```
open__phase-3-step-5-local-verify-fails-on-i18n-script.md
blocked__awaiting-cf-dist-main-secret-from-human.md
done__phase-1-design-approved.md
```

---

## Relationship to the repo-root `.issues/` folder

The repo-root `.issues/` is the Send repo's global Issues FS (per CLAUDE.md rule). It is not the place for migration-specific tasks unless they have repo-wide impact. This local folder is scoped to this dev pack only. If an issue becomes a repo-wide concern (e.g. "the reality document is out of date"), file it in `.issues/` as well and cross-link.

---

*This is a stub. No issues are open at dev pack creation time (24 April 2026).*
