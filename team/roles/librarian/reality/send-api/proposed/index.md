# send-api — Proposed Features

**Domain:** `send-api/` | **Last updated:** 2026-04-28
**Source:** Archived monolith `../v0.16.26__what-exists-today.md` — sections 30 (docs 299–311), 17 (large blob), 22 (upload modes)

---

## SgSend JS API + Web Components (doc 303, 04/19)

Browser-native send API for embedding SG/Send capabilities in any web page.

| Proposed Feature | Status |
|-----------------|--------|
| `SgSend.sendFile(file, options)` JS API | PROPOSED |
| `SgSend.sendText(text, options)` JS API | PROPOSED |
| `SgSend.sendFolder(files, options)` JS API | PROPOSED |
| `SgSend.receive(transferId, key)` JS API | PROPOSED |
| `<sg-send-drop>` — drag-drop upload Web Component | PROPOSED |
| `<sg-send-receive>` — decrypt + display Web Component | PROPOSED |
| `<sg-send-panel>` — full upload wizard embed | PROPOSED |

---

## Large Blob Client-Side (Phases 2–4) — Pending After Phase 1 (v0.19.5)

Phase 1 (server presigned endpoints) SHIPPED. Client-side routing not yet implemented.

| Proposed Feature | Status |
|-----------------|--------|
| `Vault__API`: detect `large: bool` in blob read response → route to presigned URL | PROPOSED |
| `Vault__Batch`: switch upload path based on blob size threshold | PROPOSED |
| `Vault__Fetch`: use presigned GET URL for large blob downloads | PROPOSED |
| End-to-end test: >5MB vault blob round-trip via multipart | PROPOSED |

---

## Four Collaborative Upload Modes (doc 231, 04/05)

| Mode | Description | Status |
|------|-------------|--------|
| Individual | Single sender, single receiver (current model) | EXISTS |
| Room-based | Upload to shared data room | PROPOSED — room UI exists, upload mode not integrated |
| Vault-push | Push to shared vault branch | PROPOSED |
| Vault-merge | Merge contribution into shared vault | PROPOSED |

---

## WhatsApp Share Mode (doc 259, 04/13)

Share a transfer link directly via WhatsApp deep-link integration. PROPOSED.

---

## `/api/vault/zip` Read-Only Access (OQ-2, 04/28 architect review)

Optional enhancement: allow `structure_key` or `read_key` header on the `/api/vault/zip`
endpoint (currently requires `write_key`). Would enable read-only clients to pull a full
vault snapshot. PROPOSED — open question, not yet decided.

---

## CLI Transfer Commands (v0.13.16 brief — partially superseded by sgit)

| Proposed Feature | Status |
|-----------------|--------|
| `sgit upload <file>` (file transfer via CLI, not vault) | PROPOSED — not in sgit |
| `sgit download <transfer-id>` | PROPOSED — not in sgit |
| `sgit secrets store/get/list/delete` (OS keychain) | PROPOSED — not in sgit |

*Full source: `../v0.16.26__what-exists-today.md` Section 6 (lines 817–903), Section 30 (lines 2745–2830)*

---

## SG/Relay — Content-Blind Vault Routing Service (06/16 briefs, v0.32.4)

All items below are PROPOSED — does not exist yet. The vault inbox (v0.29.1), enum_key derivation, and Storage_FS backends are EXISTS.

SG/Relay is a separate service whose only job is routing opaque payloads between external
comms systems (email/SMS/SES/IMAP/SQS/SNS) and vault inboxes. It never decrypts, never
holds the vault's read key, never stores messages. The relay is stateless w.r.t. content.

**Security property:** Inbound relay holds no vault secret (routes to append_token = H(pubkey)).
Outbound relay holds enum_key only (inbox drain, not read_key). Compromised relay cannot
reach vault plaintext.

| # | Feature | One-Line Description | Source |
|---|---------|---------------------|--------|
| P-248 | SG/Relay routing core | Stateless content-blind relay; ports-and-adapters design (both vault and external are adapters); routing config + dedup cursor as only durable state; retry with exponential back-off; v1.0 inbound, v1.1 outbound+drain | 06/16 arch-pack (relay README, 01__architecture, 04__flows) |
| P-249 | Transport adapters | Vault-inbox reference adapter (maps to shipped inbox endpoints); SES inbound/outbound; IMAP; SMS; SQS; SNS — all behind the same adapter port contract (Type_Safe); v1.0 scope: vault-inbox + SES only | 06/16 arch-pack (02__adapters) |
| P-250 | Drain client → `mail/` tree population | Outbound leg: drain client reads vault inbox via enum_key, populates `mail/` tree in recipient vault; vault is system of record; drain client is not the relay | 06/16 arch-pack (04__flows) |
| P-251 | Vault-native inbox UX | Compose window, inbox view, chrome-extension bridge (3b) for real-inbox bridging; chrome-extension bridge depends on P-157 (sealed-box); vault-native inbox (3a) ships first | 06/16 arch-pack (05__ux-mockups) |
| P-252 | SG/Relay phased deployment | SG/Compute serverless (Lambda/Fargate), event/schedule-triggered; v1.0 proves on 2 vaults (inbound only); v1.1 adds outbound/drain with 5 vaults; acceptance criteria defined in 06__deployment-and-acceptance.md | 06/16 arch-pack (06__deployment-and-acceptance) |
