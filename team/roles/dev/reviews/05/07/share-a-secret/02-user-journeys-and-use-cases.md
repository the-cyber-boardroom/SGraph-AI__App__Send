# Share a Secret — User Journeys & Use Cases

**Date:** 07 May 2026  
**Role:** Explorer Dev  
**Status:** Ready for UX design

---

## 1. The Core Mental Model

**"Share a Secret"** is not a file transfer. It is a message with an expiry. The mental model the user needs is:

> "I'm putting a sensitive piece of text in a sealed envelope. You get to open it once. After that, the envelope destroys itself."

The tech is identical to a file transfer — AES-256-GCM, same upload pipeline — but the **experience** is different:
- Sender: type text, choose how long it lives, get a link
- Recipient: click link, read text inline, link is gone

This is closer to **Signal's disappearing messages** or **1Password's secret sharing** than to WeTransfer.

---

## 2. Primary Use Cases

### UC-01 — Share a Password

**Who:** IT admin, developer, team lead  
**Context:** Need to give someone a credential securely. Slack and email are insecure. 1Password sharing requires both people to have 1Password.  
**What they want:** A one-time URL that shows the password and then destroys itself.

**Journey:**
```
1. Admin goes to send.sgraph.ai/en-gb (or directly to the secret tab)
2. Clicks "Secret" tab
3. Types: "WiFi password: Apricot#9823"
4. Leaves config as default (1 view, expires 24h)
5. Clicks "Create Secret Link"
6. Gets link: https://send.sgraph.ai/en-gb/s/abc123#keyhere
7. Copies link, pastes into WhatsApp/Slack/email
8. Recipient clicks link, sees "WiFi password: Apricot#9823"
9. Link is now dead. Second click shows "Already viewed."
```

**Security priority:** High — one-time view, auto-delete  
**Expiry preference:** Short (1h–24h)  
**Key constraint:** Must work on mobile (link received on phone via WhatsApp)

---

### UC-02 — Share an API Key or Token

**Who:** Developer, DevOps engineer  
**Context:** Need to share a staging API key with a contractor or teammate. Must not appear in Slack history, email archives, or Git.  
**What they want:** A one-time link they can send confidently, knowing it can't be re-read from Slack history.

**Journey:**
```
1. Dev goes to the "Secret" tab
2. Types: "sk-staging-abc123def456"
3. Optionally adds label context in the text: "Staging API key for project Atlas. Expires next Friday."
4. Sets config: 1 view, expires 48h
5. Gets link, sends via Slack DM
6. Contractor clicks link, sees the key, copies it
7. Link auto-deletes. No trace in Slack is the actual key value.
```

**Security priority:** Very high — contractor scenario, no trusted channel  
**Expiry preference:** Medium (24h–72h)  
**Key constraint:** Sender wants confirmation the link was opened (download_count visible to sender)  

---

### UC-03 — Share Credentials for a Shared Account

**Who:** Team lead, ops manager  
**Context:** A team of 3–5 people needs access to a shared service credential. Don't want to post it in a group chat.  
**What they want:** A link that works N times for N team members, then stops.

**Journey:**
```
1. Manager goes to "Secret" tab
2. Types: "Shared Zoom account: user@company.com / P@ssword123"
3. Sets config: 5 views, expires 7 days
4. Gets link, posts in team Slack channel
5. Each of 5 teammates clicks it, sees credentials
6. 6th person gets "This secret has been viewed the maximum number of times"
7. After 7 days, link expires regardless of view count
```

**Security priority:** Medium — internal team, but avoiding permanent Slack exposure  
**Expiry preference:** Days (3–7 days)  
**Key constraint:** N-views mode must be obvious to set

---

### UC-04 — Share a Data Room Access Key

**Who:** Admin console user (admin.send.sgraph.ai)  
**Context:** Admin has generated an access key for a data room member. Needs to deliver it securely.  
**What they want:** A "Share via Secret Link" button directly in the admin UI — auto-creates a one-time link with the key pre-filled.

**Journey:**
```
1. Admin creates a data room user key in the admin console
2. Clicks "Share via Secret Link" button next to the key
3. Secret is automatically created (no need to go to the main UI)
4. Admin gets a link to send to the new room member
5. Member clicks link, sees their access key
6. Admin can see in the console: "Key delivered: link opened 1 time"
```

**Security priority:** High — PKI-adjacent workflow  
**Expiry preference:** Short (6h–24h)  
**Key constraint:** Admin console integration (Phase 2 — not this brief)

---

### UC-05 — Leave a Secret Note / One-Time Message

**Who:** Any user  
**Context:** Want to send something sensitive that shouldn't be in an email thread long-term. Confirmation codes, 2FA backup codes, sensitive personal info.  
**What they want:** Send a message that expires.

**Journey:**
```
1. User goes to "Secret" tab
2. Types a sensitive message: "Your NI number is AB123456C. Please confirm receipt."
3. Sets config: 1 view, expires 24h
4. Sends link
5. Recipient views, the message disappears from the server
```

**Security priority:** Medium  
**Expiry preference:** 24h default  
**Key constraint:** Should feel like "secure messaging" not "file transfer"

---

### UC-06 — "Kill a Secret" Before It's Viewed

**Who:** Any sender  
**Context:** Sent the link to the wrong person or changed their mind. Need to kill the secret before the recipient opens it.  
**What they want:** A way to invalidate the link even after sending it.

**Journey:**
```
1. Sender creates a secret, gets a link
2. Realises they sent it to the wrong person on Slack
3. Opens the "kill link" (displayed alongside the share link)
4. Confirms deletion — "Secret deleted"
5. Recipient clicks the original link → "This secret has been deleted by the sender"
```

**Security priority:** Critical — mistake recovery  
**Key constraint:** The kill link must be shown at creation time only. If the sender loses it, they cannot delete. This is a feature, not a bug — zero-knowledge means we can't help them.

---

## 3. Edge Cases & Error States

| Scenario | What User Sees | Backend Signal |
|---|---|---|
| Link opened for the first time | Secret text, inline | `download_count` = 0 → 1 |
| Link opened when `max_downloads` exhausted | "This secret has already been viewed" | `download_count >= max_downloads` |
| Link opened after `expires_at` | "This secret has expired" | `is_expired = true` |
| Link opened after sender deleted it | "This secret has been deleted" | 404 with no payload |
| Link opened with wrong/missing key | Decryption fails in browser | Content decrypted to garbage → show error |
| Link opened on slow connection | Spinner while fetching → then decrypt | Normal loading state |
| Link opened a second time (race condition) | Second viewer sees "already viewed" | Server enforces count atomically |
| Sender copies link with extra characters | Decryption fails | Key parsing must be robust |

---

## 4. Ephemerality Modes — What We Build in Phase 1

| Mode | Config | Use Case |
|---|---|---|
| **One view** (default) | `max_downloads=1, auto_delete=true, expires_at=+24h` | Passwords, API keys |
| **N views** | `max_downloads=N, auto_delete=true, expires_at=+7d` | Team credentials |
| **Time only** | `max_downloads=0, auto_delete=false, expires_at=+Xh` | Time-limited but re-readable |
| **Time + views** | `max_downloads=N, auto_delete=true, expires_at=+Xd` | Most flexible |

The **UI defaults to one-view + 24h**. This is the safest default and the most common use case.

---

## 5. Sender Journey — Detailed Step-by-Step

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: CREATION                                              │
│                                                                 │
│  1. User arrives at send.sgraph.ai/en-gb                       │
│  2. Sees three tabs: [File] [Text] [Secret]                     │
│     OR: navigates directly to /en-gb/secret/                   │
│  3. Types or pastes the secret                                  │
│  4. Optionally adjusts expiry (default: 1 view, 24h)           │
│  5. Clicks "Create Secret Link"                                 │
│                                                                 │
│  PHASE 2: ENCRYPTION (invisible, ~100ms)                        │
│                                                                 │
│  6. Browser generates random AES-256-GCM key                   │
│  7. Browser encrypts text to binary ciphertext                  │
│  8. Browser derives delete_auth from key + ':delete'           │
│  9. API call: createTransfer(size, type,                        │
│       max_downloads=1, auto_delete=true,                        │
│       expires_at='2026-05-08T12:00:00Z',                       │
│       delete_auth_hash=sha256(delete_auth))                     │
│ 10. API call: uploadPayload(transferId, ciphertext)             │
│ 11. API call: completeTransfer(transferId)                      │
│                                                                 │
│  PHASE 3: DONE — LINK DISPLAY                                   │
│                                                                 │
│ 12. Browser constructs share URL:                               │
│     https://send.sgraph.ai/en-gb/s/{transferId}#{keyHex}       │
│ 13. Browser constructs kill URL:                                │
│     send-secret://kill#{transferId}:{deleteAuth}                │
│     (encoded opaquely — user stores it, doesn't need to parse) │
│ 14. UI shows:                                                   │
│     - Share link (big, copyable)                                │
│     - Kill link (smaller, "save this to delete early")          │
│     - Expiry reminder: "Expires in 24h or after 1 view"        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Recipient Journey — Detailed Step-by-Step

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: ARRIVAL                                               │
│                                                                 │
│  1. Recipient clicks link (from WhatsApp/Slack/email):          │
│     https://send.sgraph.ai/en-gb/s/abc123#keyhere              │
│  2. Browser loads /en-gb/s/index.html                           │
│     → Static page, no server-side rendering                     │
│  3. Page reads transferId from URL path                         │
│  4. Page reads key from URL #fragment                           │
│     → Fragment NEVER sent to server (browsers don't)            │
│                                                                 │
│  PHASE 2: FETCH & DECRYPT                                       │
│                                                                 │
│  5. JS fetches ciphertext:                                      │
│     GET /api/transfers/download-base64/{transferId}             │
│     → Server increments download_count                          │
│     → Server auto-deletes payload if max_downloads reached      │
│  6. JS decodes base64 → ArrayBuffer                             │
│  7. JS imports key from hex string                              │
│  8. JS decrypts AES-256-GCM                                     │
│  9. JS decodes UTF-8 → plain text string                        │
│                                                                 │
│  PHASE 3: DISPLAY                                               │
│                                                                 │
│ 10. Page renders the secret text inline                         │
│ 11. Shows ephemerality notice:                                  │
│     "⚠ This secret has been deleted from the server."          │
│     (if auto_delete was true and max_downloads reached)         │
│     OR: "This link can be viewed N more times."                 │
│ 12. Shows: [Copy to Clipboard] button                           │
│ 13. Shows: SG/Send branding + "How this works" link             │
│                                                                 │
│  PHASE 4: AFTER VIEWING                                         │
│                                                                 │
│ 14. If recipient clicks the link again → "Already viewed"       │
│     OR: server returns 410 Gone / 403 (download limit hit)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Journey Touchpoints Summary

| Touchpoint | Actor | Screen | Key Action |
|---|---|---|---|
| Main site / secret tab | Sender | Upload page — secret tab | Type secret, set config |
| Link display | Sender | Done state | Copy share link, save kill link |
| Email / WhatsApp / Slack | Sender | External | Send link to recipient |
| Secret view page | Recipient | `/en-gb/s/` | Read secret, copy text |
| Already-viewed page | Recipient (2nd attempt) | `/en-gb/s/` error state | Informed link is dead |
| Expired page | Recipient (too late) | `/en-gb/s/` error state | Informed link expired |
| Kill link | Sender | `/en-gb/s/kill/` or inline | Delete before recipient views |

---

## 8. What Makes This "Share a Secret" Not "Share a Text File"

| Dimension | File Transfer (current Text mode) | Share a Secret (new) |
|---|---|---|
| Mental model | "I'm uploading a document" | "I'm sending a sealed envelope" |
| Recipient experience | Downloads a `.txt` file | Reads text inline in browser |
| Ephemerality | None (persists until manual deletion) | Auto-deletes after N views or X time |
| UX framing | Step 1 of 6 wizard | 2-step: type + send |
| Primary action | "Encrypt & Send" | "Create Secret Link" |
| Result URL | `send.sgraph.ai/en-gb/download/#transferId/key` | `send.sgraph.ai/en-gb/s/transferId#key` |
| Kill switch | None | Kill link shown at creation |
| Download count visible | Not to sender | Sender can check status |
| Character limit | No practical limit | Soft advisory at ~10,000 chars |
