# P3 #4: Token Validation Fails Open

**Severity:** P3 — Must fix before production
**Reviewer finding #:** 4
**Reviewer severity:** P1
**Location:** `Admin__Service__Client__Setup.py:35-36`, `Fast_API__SGraph__App__Send__User.py:54-55`
**Status:** Open

---

## What Is the Work?

Token validation silently skips all authentication when the admin environment variable is missing. A silent exception catch in app setup also results in open access. This is the most dangerous class of auth bug — "fails open" means a configuration error grants full access instead of denying it.

## What Does Success Look Like?

1. If admin config is missing in production, the application raises an exception at startup and refuses to start
2. No code path exists where a missing or invalid configuration results in auth being skipped
3. Silent exception catches at security boundaries are replaced with explicit error handling
4. Test exists that verifies: missing config = startup failure (not silent bypass)
5. Test exists that verifies: invalid token = request denied (never silently allowed)

## Why P3?

Silent auth bypass is the most dangerous class of bug. No impact today (no sensitive data on server — only encrypted bytes), but catastrophic if this reaches production with real users. The pattern itself is the concern — any "fails open" auth path is unacceptable.

## Scope

- `Admin__Service__Client__Setup.py` lines 35-36 — missing env var handling
- `Fast_API__SGraph__App__Send__User.py` lines 54-55 — silent exception catch
- Any other code paths where missing config could result in auth bypass (AppSec to audit)

## Known Constraints

- Must fail closed in ALL scenarios — missing config, invalid config, exception during auth, timeout during auth
- The fix must not break local development (developer experience matters) — but local dev should use explicit "dev mode" flag, not silent auth bypass

## Roles

| Role | Responsibility |
|------|---------------|
| Developer | Implement the fix |
| AppSec | Validate the fix, audit for other fails-open paths |
| QA | Write tests for missing config, invalid config, exception scenarios |
