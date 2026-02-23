# PKI Key Discovery & Registry — Dev Pack

**Version:** v0.5.0
**Date:** 2026-02-21
**Pack type:** Workstream (full pack)
**Target audience:** LLM coding session (Claude Code)
**Objective:** Implement key discovery and public key registry for the SG/Send admin console, using the IFD Issues-FS modular UI architecture

---

## What You Are Building

A **key discovery and public key registry** system for the SG/Send admin console. This involves:

1. **Backend API** (5 endpoints on Admin Lambda) — publish, lookup, unpublish, list keys, transparency log
2. **IFD Admin Shell** (v0.1.3) — refactored admin UI with EventBus, Router, left-nav, debug panels
3. **PKI Component Refactor** — break the monolithic `pki-manager.js` (1821 lines) into 3 focused components
4. **4 new key discovery components** — publish, lookup, registry, transparency log
5. **Storage browser** — admin debugging tool for Memory-FS visibility
6. **3 debug side panels** — API Invocations, UI Events, UI Messages

Everything goes on the **Admin Lambda** (already auth-protected by Fast_API cookie auth). No anonymous access. No User Lambda changes.

---

## Key Constraints

| Constraint | Detail |
|-----------|--------|
| **IFD architecture** | EventBus for component communication, Shell+Router for navigation, light DOM (NO Shadow DOM for new components), self-contained Web Components |
| **Type_Safe only** | All Python schemas use `Type_Safe` from `osbot-utils`. Never Pydantic. |
| **osbot-aws for AWS** | All AWS operations go through `osbot-aws`. Never boto3 directly. |
| **Memory-FS storage** | All storage through `Send__Cache__Client`. Never direct filesystem or S3. |
| **No mocks in tests** | Real implementations with in-memory backends. |
| **Admin Lambda auth** | All endpoints behind cookie auth. No per-endpoint auth logic needed. |
| **Case-insensitive codes** | Lookup codes normalised to lowercase at API boundary, displayed uppercase. |
| **New version v0.1.3** | All new UI goes in `v0.1.3/`. Never modify v0.1.0, v0.1.1, or v0.1.2. |
| **No plaintext on server** | Only Obj_Ids, PEM keys, timestamps, lookup codes. No labels, no names. |
| **3 debug panels required** | API Invocations, UI Events, UI Messages (from IFD Issues-FS pattern) |

---

## Where This Fits in the Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SGraph Send                               │
│                                                              │
│  User Lambda (public)          Admin Lambda (auth-protected) │
│  ├ /transfers/*                ├ /tokens/*        ← existing │
│  ├ /health/*                   ├ /keys/*          ← NEW      │
│  └ Static UI (user)            ├ /storage/*       ← NEW      │
│                                ├ /cache-browser/* ← existing │
│                                ├ /metrics/*       ← existing │
│                                └ Static UI (admin)           │
│                                  └ v0.1.3/        ← NEW      │
└─────────────────────────────────────────────────────────────┘
```

---

## 5 Phases

### Phase 1: IFD Foundation (v0.1.3 shell + EventBus + debug panels)
Create the new admin shell with IFD architecture. Migrate existing components. No new features.

### Phase 2: PKI Component Refactor
Break `pki-manager.js` into `<pki-keys>`, `<pki-encrypt>`, `<pki-contacts>` + shared `pki-common.js`.

### Phase 3: Backend API + Key Discovery Components
5 API endpoints + `Service__Keys` + 4 new UI components (publish, lookup, registry, log).

### Phase 4: Storage Browser
Memory-FS content browser for admin debugging (3 API endpoints + UI component).

### Phase 5: QR Codes + Polish
QR code generation for lookup codes. Navigation polish.

---

## Files to Read First

Before starting, read these files to understand the patterns:

### Architecture & Plan
1. **The full implementation plan:** `team/roles/dev/reviews/26-02-21/v0.5.0__implementation-plan__key-discovery-and-registry-revised.md` — has component inventory, event catalogue, shell layout, phased plan
2. **AppSec read-now:** `team/roles/appsec/reviews/26-02-21/v0.5.0__appsec__read-now.md` — 3 security items to address in the build

### Backend Patterns (follow these exactly)
3. **Service__Tokens:** `sgraph_ai_app_send/lambda__admin/service/Service__Tokens.py` — pattern for `Service__Keys`
4. **Routes__Tokens:** `sgraph_ai_app_send/lambda__admin/fast_api/routes/Routes__Tokens.py` — pattern for `Routes__Keys`
5. **Send__Cache__Client:** `sgraph_ai_app_send/lambda__admin/service/Send__Cache__Client.py` — storage layer to extend
6. **Fast_API app:** `sgraph_ai_app_send/lambda__admin/fast_api/Fast_API__SGraph__App__Send__Admin.py` — where to register routes

### Frontend (source for refactor)
7. **Admin shell (v0.1.2):** `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.2/components/admin-shell/admin-shell.js` — current shell to replace
8. **Admin index.html:** `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.2/index.html` — current entry point
9. **PKI manager:** `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.2/components/pki-manager/pki-manager.js` — 1821-line component to break up
10. **Admin API client:** `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.0/js/admin-api.js` — API client to extend
11. **Admin CSS:** `sgraph_ai_app_send__ui__admin/v0/v0.1/v0.1.0/css/admin.css` — dark theme CSS variables

### IFD Reference
12. **IFD Issues-FS guide:** `library/guides/development/ifd/ifd__issues-fs/` — the modular UI architecture to follow
13. **IFD intro:** `library/guides/development/ifd/v1.2.1__ifd__intro-and-how-to-use.md`

### Human Brief (the original requirement)
14. **Dev brief:** `team/humans/dinis_cruz/briefs/02/21/v0.4.27__dev-brief__key-discovery-and-public-registry.md`

---

## Human Decisions (already made — follow these)

| Question | Answer |
|----------|--------|
| Case-insensitive lookup codes? | **Yes.** Normalise to lowercase at API boundary. Display uppercase. |
| Registry accessible without admin auth? | **No.** Admin-only for now. |
| Challenge-response for publish? | **Not for now.** MVP stage, high trust. |
| Admin-shell navigation? | **Everything in admin shell.** No standalone pages. |
| Versioned path for new pages? | **Yes, always.** New version v0.1.3. Never modify v0.1.2. |
| Auth model? | All endpoints on Admin Lambda. Already protected. No additional auth. |
| Debug panels? | **Required.** API Invocations, UI Events, UI Messages. |
| PKI refactor? | **Yes.** Break pki.html into components, each doing one thing, communicating via events (IFD). |

---

## Admin Config (version routing)

When creating v0.1.3, update `admin__config.py`:
```python
APP_SEND__UI__ADMIN__LATEST__VERSION = "v0.1.3"  # was "v0.1.2"
```

This makes `/admin` redirect to `/admin/v0/v0.1/v0.1.3/index.html`.

---

## Quick Reference: Event Catalogue

```
Key lifecycle:       key-generated, key-deleted, key-selected, key-published, key-unpublished
Contact lifecycle:   contact-imported, contact-selected, contact-deleted
Message operations:  message-encrypted, message-decrypted
Registry:            registry-loaded, log-loaded, log-verified
Navigation:          navigated, app-registered
Service:             api-call, api-error, message-added, refresh, event-bus-ready
Storage:             storage-path-selected, storage-data-loaded
```

---

## Quick Reference: Component Tags

```
Existing (migrated):    <token-manager>, <system-info>, <cache-browser>, <analytics-dashboard>, <metrics-dashboard>
PKI (refactored):       <pki-keys>, <pki-encrypt>, <pki-contacts>
Key Discovery (new):    <key-publish>, <key-lookup>, <key-registry>, <key-log>
Infrastructure (new):   <storage-browser>
Debug panels (new):     <messages-panel>, <events-viewer>, <api-logger>
Shell (new):            <admin-shell> (v0.1.3, light DOM, EventBus, Router)
```

---

## Quick Reference: API Endpoints (new)

```
POST   /keys/publish              — publish a public key → get lookup code
GET    /keys/lookup/{code}        — look up key by code
DELETE /keys/unpublish/{code}     — unpublish a key
GET    /keys/list                 — list all published keys
GET    /keys/log                  — transparency log entries

GET    /storage/namespaces        — list Memory-FS namespaces
GET    /storage/browse/{ns}       — list files in namespace
GET    /storage/read/{ns}/{path}  — read file content
```
