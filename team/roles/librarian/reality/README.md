# Reality — What Actually Exists

This folder contains the canonical, code-verified record of what SGraph Send actually implements.

## Why This Exists

Agents were confusing ideas described in briefs and voice memos with features that actually exist in code. This created a false picture of the product — proposed user journeys were described as shipped, and planned features were treated as delivered.

**This folder fixes that.** Every claim here was verified by reading source code, not documentation.

## Rules

1. **If it's not in the reality document, it does not exist.** No agent may claim a feature is "working" or "shipped" unless it appears here.
2. **Proposed features must be labelled.** If an agent describes something that isn't in the reality document, they must explicitly write "PROPOSED — does not exist yet."
3. **Code authors update this document.** When a Dev commits code that adds, removes, or changes an endpoint, UI page, or test, they must update the reality document.
4. **The Librarian verifies.** The Librarian periodically cross-checks the reality document against the codebase.

## Current Document

- `v0.6.36__what-exists-today.md` — Reality as of v0.6.36 (2026-02-26)

## Naming Convention

`{version}__what-exists-today.md`

Only one current version should exist. Previous versions can be kept for historical reference but should be clearly marked as superseded.
