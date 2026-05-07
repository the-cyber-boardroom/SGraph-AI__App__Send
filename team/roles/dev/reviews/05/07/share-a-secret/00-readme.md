# Share a Secret — Dev Brief Pack

**Date:** 07 May 2026  
**Branch:** `claude/explore-sgraph-ui-ybBkS`  
**Status:** Implementation reviewed — 3 bugs to fix before shipping  
**Backend work required:** None — all backend capabilities are already live in production  

---

## The One-Line Summary

The "Share a Secret" feature is **a frontend-only task**. The backend has supported `max_downloads`, `auto_delete`, `expires_at`, and `delete_auth_hash` since v0.16.26 — the UI has never sent these fields. This brief pack maps out what needs building.

---

## Documents in This Pack

| # | Document | What It Covers |
|---|---|---|
| 01 | [Discovery & Technical Context](./01-discovery-and-technical-context.md) | What the backend can already do; where the gap is; the original brief from Feb 25 |
| 02 | [User Journeys & Use Cases](./02-user-journeys-and-use-cases.md) | 6 use cases with step-by-step flows; edge cases; error states; sender/recipient journeys |
| 03 | [UX Wireframes](./03-ux-wireframes.md) | 9 screen wireframes: creation, encrypting, done, receive, already-viewed, expired, deleted, kill confirm, standalone page |
| 04 | [Implementation Plan](./04-implementation-plan.md) | Exact IFD v0.3.2 surgical changes; new files; API wiring; test plan; session handoff notes |
| 05 | [Consolidate Delivery + Share Step](./05-consolidate-delivery-share-step.md) | 6→5 step wizard: merge delivery+share into single Options step; full gotcha map; new component spec |
| 06 | [Code Review — v0.3.2](./06-code-review-v032.md) | Review of dev agent implementation: 3 bugs + 2 minor issues + fix checklist |

---

## Key References

| Document | Location |
|---|---|
| Original one-time secret brief (Feb 25) | `team/humans/dinis_cruz/briefs/02/25/v0.6.30__dev-brief__one-time-secret-link.md` |
| Transfer schema (with all fields) | `sgraph_ai_app_send/lambda__user/schemas/Schema__Transfer.py` |
| Transfer service (enforcement logic) | `sgraph_ai_app_send/lambda__user/service/Transfer__Service.py` |
| Focused use-case UIs brief | `team/humans/dinis_cruz/briefs/03/23/v0.16.53__dev-brief__focused-usecase-uis.md` |
| Send/Receive API brief | `team/humans/dinis_cruz/briefs/04/19/v0.21.3__dev-brief__send-receive-reference-implementation.md` |
| API reality doc | `team/roles/librarian/reality/send-api/index.md` |

---

## What Gets Built (Phase 1)

1. **[File] [🔒 Secret] tabs** — Text tab removed; Secret tab replaces it
2. **Expiry config UI** — radio buttons: views (1/5/10) + time (1h/24h/7d)
3. **API client patch** — `createTransfer()` now sends secret params
4. **Done state for secrets** — shows share link + kill link, ephemerality notice
5. **New receive page** — `/en-gb/s/{transferId}#{keyHex}` — inline text display, no file download
6. **Error states** — already viewed, expired, deleted by sender
7. **6→5 step wizard** — Delivery + Share mode merged into single "Options" step (`upload-step-options`)

## What Gets Built (Phase 2)

- Standalone focused page `/en-gb/secret/`
- Admin console "Share via Secret Link" button
- Sender can check if link was opened
