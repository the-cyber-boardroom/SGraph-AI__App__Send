# INC-004: Documentation Token Leak (Data Breach) — Incident Pack

**Incident ID:** INC-004
**Date:** 2026-02-19
**Severity:** P2-as-P1 (confirmed data breach, highest process rigour)
**Type:** Internal discovery — documentation pipeline leak
**Status:** RESOLVED (ICO notification not required)
**Incident lead:** Conductor
**Technical lead:** AppSec
**Data protection lead:** DPO

---

## What Happened

While documenting the INC-003 fix, AI agents (Historian, Journalist, Librarian) included real credential values — the `linkedin-user` access token, transfer ID `16bff884b7da`, and its decryption key — as examples in incident documentation. These were committed and pushed to a GitHub branch.

The transfer ID + decryption key combination is the full data access path on SGraph Send. This meant anyone with branch access could download and decrypt a real user file — an "Enterprise AI Time-to-Value Survey" containing the user's name and email.

Discovered by Dinis Cruz at ~16:00. Contained by 16:28 (S3 object permanently deleted).

## Key Facts

- **Exposure window:** ~30 minutes (15:50 to 16:20)
- **6 files contained leaked values** (3 roles: Historian, Journalist, Librarian)
- **S3 object permanently deleted** at 16:28 — decryption key now useless
- **Download count during exposure:** 1 (believed to be user's own legitimate download)
- **User data classification:** Level 1 — Public (name, email on a filled-in survey)
- **ICO notification:** NOT REQUIRED
- **Deliberate token exposure:** After containment, Data Controller chose to leave the access token active (20 uses remaining) as a controlled experiment (D080-D082)

## Timeline Summary

| Time | Event |
|------|-------|
| ~15:07 | User uploads survey file |
| ~15:45 | Agents commit documentation with real values |
| ~15:50 | Documents pushed to GitHub branch |
| ~16:00 | Human spots token in Journalist article |
| ~16:04 | Round 1 redaction (tokens) — 6 files |
| ~16:12 | Round 2 redaction (transfer IDs, decryption keys) — 3 files |
| ~16:15 | Escalated to P2-as-P1 (data breach confirmed) |
| ~16:20 | S3 deletion initiated |
| ~16:28 | S3 deletion confirmed — data irrecoverable |
| ~16:28 | New SG/Send link sent to recipient |
| ~16:36 | Deliberate decision: push to `dev` with token active (risk accepted) |
| ~17:00 | Voice interview completes content sensitivity questionnaire |
| ~17:15 | **INC-004 closed** — Level 1 Public, no ICO notification required |

## Immune System Gain

Data breach notification process (from scratch), ICO reporting assessment framework, `[REDACTED]` as default convention, S3 deletion as retroactive zero-knowledge remedy, voice interview workflow for regulatory questionnaires, risk acceptance framework for deliberate credential exposure. 12 new decisions (D074-D082, plus interim), 3 new patterns (P20-P22).

---

## Source Documents

### Core Incident Records

| Document | Role | Location |
|----------|------|----------|
| Incident record | Historian | `team/roles/historian/reviews/26-02-19/v0.4.12__incident-record__INC-004__documentation-token-leak.md` |
| Master index addendum | Librarian | `team/roles/librarian/reviews/26-02-19/v0.4.12__master-index-addendum__INC-004-documentation-token-leak.md` |
| Journalist addendum | Journalist | `team/roles/journalist/reviews/26-02-19/v0.4.12__addendum__documentation-token-leak.md` |
| Full-arc article | Journalist | `team/roles/journalist/reviews/26-02-19/v0.4.16__article__from-leak-to-feature-full-arc.md` |

### Data Breach Response

| Document | Role | Location |
|----------|------|----------|
| Data breach notification process | AppSec | `team/roles/appsec/reviews/26-02-19/v0.4.12__data-breach-notification-process.md` |
| User breach notification | AppSec | `team/roles/appsec/reviews/26-02-19/v0.4.12__user-breach-notification__INC-004.md` |
| ICO reporting assessment | AppSec | `team/roles/appsec/reviews/26-02-19/v0.4.12__ico-reporting-assessment__INC-004.md` |
| Voice interview brief | AppSec | `team/roles/appsec/reviews/26-02-19/v0.4.12__voice-interview__INC-004-content-sensitivity.md` |
| User responses (voice interview) | Human | `team/humans/dinis_cruz/briefs/02/19/incident/v0.4.15__incident-004__dinis-answers-to-interview.md` |

### Risk Acceptance (Deliberate Token Exposure)

| Document | Role | Location |
|----------|------|----------|
| Risk acceptance | GRC | `team/roles/grc/reviews/26-02-19/v0.4.12__risk-acceptance__deliberate-token-exposure.md` |
| Trail assessment | Sherpa | `team/roles/sherpa/reviews/26-02-19/v0.4.12__trail-assessment__deliberate-token-exposure.md` |
| DPO assessment | DPO | `team/roles/dpo/reviews/26-02-19/v0.4.12__assessment__deliberate-token-exposure.md` |

### Workflow Observations

| Document | Role | Location |
|----------|------|----------|
| Voice mode workflow observations | Librarian | `team/roles/librarian/reviews/26-02-19/v0.4.16__note__chatgpt-voice-mode-workflow-observations.md` |
| Voice mode UX friction | Sherpa | `team/roles/sherpa/reviews/26-02-19/v0.4.16__ux-observation__chatgpt-voice-mode-friction.md` |

### Debriefs

| Document | Role | Location |
|----------|------|----------|
| GRC debrief | GRC | `team/roles/grc/reviews/26-02-19/v0.4.16__debrief__INC-004-complete.md` |
| AppSec debrief | AppSec | `team/roles/appsec/reviews/26-02-19/v0.4.16__debrief__INC-004-complete.md` |

### Cross-Incident

| Document | Role | Location |
|----------|------|----------|
| Incident attribution leaderboard | Historian | `team/roles/historian/reviews/26-02-19/v0.4.16__leaderboard__incident-attribution.md` |
| Human brief (original INC-003 article) | Human | `team/humans/dinis_cruz/briefs/02/19/incident/v0.4.12__incident__access-token-leak-in-shareable-links.md` |

---

## Roles Involved

| Role | Contribution |
|------|-------------|
| **AppSec** | Data breach notification process, user notification, ICO assessment, voice interview brief, debrief |
| **GRC** | Risk acceptance for deliberate token exposure (D080), debrief |
| **DPO** | Data protection assessment, DPIA requirement for future sharing (D081-D082) |
| **Historian** | Incident record, timeline, decisions D074-D079, attribution leaderboard |
| **Journalist** | Addendum article, full-arc narrative article |
| **Librarian** | Master index addendum, voice mode workflow observations |
| **Sherpa** | Trail assessment (deliberate exposure), UX friction log (voice mode) |
| **Conductor** | Severity escalation to P2-as-P1 |
| **Human (Dinis Cruz)** | Discovery, S3 deletion, new link to recipient, voice interview, risk acceptance decision |
