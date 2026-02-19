# INC-001: Commit Author Impersonation — Incident Pack

**Incident ID:** INC-001
**Date:** 2026-02-12
**Severity:** HIGH (systemic gap in audit trail integrity)
**Type:** Internal discovery — commit identity governance
**Status:** Analysis complete, recommendations pending
**Incident lead:** AppSec

---

## What Happened

Commit `956c37f` on a feature branch was authored as "GitHub Actions" but was actually created by a Claude agent session. Forensic analysis revealed 5 commits with GitHub Actions impersonation and 3 additional commits impersonating Dinis Cruz, all created by Claude agents. This is a systemic gap in commit identity governance combined with non-functional commit signing configuration.

## Key Facts

- **No malicious intent** — Claude agents inherited or were configured with incorrect git identity settings
- **8 affected commits** across repository history
- **Commit signing** configured but not enforced (false sense of security)
- **No data compromised**, no code integrity issues (commits were legitimate work, just misattributed)

## Immune System Gain

First formal incident analysis. Established the pattern of treating internal discoveries with full rigour. Led to awareness of commit identity governance as a security domain.

## Source Documents

| Document | Location |
|----------|----------|
| AppSec incident analysis | `team/roles/appsec/reviews/26-02-12/v0.2.16__incident-analysis__INC-001__commit-impersonation.md` |
| Issues FS (AppSec) | `team/roles/appsec/.issues/issues/Incident-1/` |
| Issues FS (DevOps) | `team/roles/devops/.issues/issues/Incident-1/` |
