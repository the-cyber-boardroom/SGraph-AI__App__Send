# INC-002: First External Security Disclosure — Master Brief

**Incident ID:** INC-002
**Declared:** 2026-02-17
**Severity:** P1 (process rigour)
**Type:** Externally reported vulnerability disclosure
**Status:** OPEN
**Incident lead:** Conductor
**Technical lead:** AppSec

---

## What Happened

Two beta users provided feedback on SG/Send. User A (security professional) conducted a full-stack security code review of the open-source codebase across all IFD versions (v0.1.0 through v0.1.6) and delivered a 29-finding report via SG/Send itself. User B (beta tester) confirmed the product works and provided 3 feature requests.

## Key Facts

- **Zero-knowledge model validated** — AES-256-GCM correct, server never sees plaintext or keys
- **0 crisis-level findings** (0 P0, 0 P1, 0 P2 on our internal scale)
- **3 must-fix-before-production** (P3): token validation fails open, plaintext in localStorage, token race condition
- **11 defence-in-depth improvements** (P4-P5)
- **15 low-priority hardening** (P6-P8)
- **10 feature suggestions**, 12 of 13 total suggestions already on roadmap
- **No data compromised**, no active exploitation

## Sub-Packs

Each finding or finding group has its own briefing pack:

| Pack | Our Severity | Findings | Status |
|------|-------------|----------|--------|
| [p3-04-token-validation-fails-open](p3-04-token-validation-fails-open/BRIEF.md) | P3 | #4 | Open |
| [p3-05-localstorage-plaintext](p3-05-localstorage-plaintext/BRIEF.md) | P3 | #5 | Open |
| [p3-01-token-race-condition](p3-01-token-race-condition/BRIEF.md) | P3 | #1 | Open |
| [p4-grouped-should-fix](p4-grouped-should-fix/BRIEF.md) | P4 | #2, #3, #9, #10, #14 | Open |
| [p5-defence-in-depth](p5-defence-in-depth/BRIEF.md) | P5 | #6, #7, #8, #13, #15, #23 | Open |
| [p6-p8-hardening](p6-p8-hardening/BRIEF.md) | P6-P8 | #11, #12, #16-22, #24-29 | Open |
| [test-gaps](test-gaps/BRIEF.md) | P3-P6 | Test gaps identified | Open |
| [functionality-suggestions](functionality-suggestions/BRIEF.md) | Feature | 10 suggestions from User A | Open |
| [user-feedback](user-feedback/BRIEF.md) | Relationship | User B feedback + User A relationship | Open |

## Severity Reclassification

The reviewer used their own P0-P3 scale. We reclassified using our business-impact scale:

| Our Rating | Meaning | Count |
|-----------|---------|-------|
| P0 | Major crisis — shut down everything | 0 |
| P1-P2 | Major/significant incident with customer impact | 0 |
| P3 | Must fix before production | 3 |
| P4 | Should fix — real vulnerability, low current risk | 5 |
| P5 | Fix when convenient — defence-in-depth | 6 |
| P6 | Minor improvement | 7 |
| P7 | Cosmetic or theoretical | 7 |
| P8 | Negligible | 1 |

## Coordination

- **Incident declaration:** `team/roles/conductor/reviews/26-02-17/v0.4.9__incident-declaration__INC-002__first-external-security-disclosure.md`
- **Triggering brief:** `team/humans/dinis_cruz/briefs/02/17/v0.4.7__daily-brief__all-teams-17-feb-2026.md`
- **User A interview brief:** `team/roles/journalist/reviews/26-02-17/v0.4.9__interview-brief__user-a-security-reviewer.md`
