# Share a Secret — UX Wireframes

**Date:** 07 May 2026  
**Role:** Explorer Dev / Designer  
**Status:** Draft — for review and iteration

All wireframes use the existing Aurora dark theme:
- Background: `#1A1A2E` (dark navy)
- Surface: `#1E2A4A` (card background)
- Accent: `#4ECDC4` (teal)
- Text: `#E0E0E0`
- Secondary text: `#8892A0`

---

## Screen A — Secret Creation (within main upload page)

The "Text" tab is **removed**. The "Secret" tab replaces it — typed text now lives here with ephemerality built in. Users who need to share a plain text file use the File tab (drag-and-drop a `.txt`).  
This is a surgical overlay — no changes to the surrounding card structure.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  [Header: SG/Send BETA | Your files, your keys, your privacy]    EN-GB ▼       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  ● Upload ────── ○ Deliver ────── ○ Share ────── ○ Confirm ─── ○ Done   │   │
│  │  Step 1 of 6                                                             │   │
│  │                                                                          │   │
│  │  ┌─────────┐  ╔══════════════════╗                                       │   │
│  │  │  File   │  ║  🔒 Secret  NEW  ║                                       │   │
│  │  └─────────┘  ╚══════════════════╝                                       │   │
│  │                                                                          │   │
│  │  ┌────────────────────────────────────────────────────────────────────┐  │   │
│  │  │                                                                    │  │   │
│  │  │  Type or paste the secret to encrypt and share...                  │  │   │
│  │  │                                                                    │  │   │
│  │  │                                                                    │  │   │
│  │  │                                                                    │  │   │
│  │  │                                                                    │  │   │
│  │  └────────────────────────────────────────────────────────────────────┘  │   │
│  │  0 characters                                                            │   │
│  │                                                                          │   │
│  │  Expires after:   ┌───────────────────────┐                             │   │
│  │                   │ ● 1 view  (default)   │                             │   │
│  │                   │ ○ 5 views             │                             │   │
│  │                   │ ○ 10 views            │                             │   │
│  │                   └───────────────────────┘                             │   │
│  │                                                                          │   │
│  │  Expires in:      ┌──────────────────────────────┐                      │   │
│  │                   │ ● 1 hour                     │                      │   │
│  │                   │ ○ 24 hours  (default)        │                      │   │
│  │                   │ ○ 7 days                     │                      │   │
│  │                   │ ○ No time limit               │                      │   │
│  │                   └──────────────────────────────┘                      │   │
│  │                                                                          │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │   │
│  │  │  🔒 Zero cookies · Zero tracking · We cannot read your secret  │   │   │
│  │  └─────────────────────────────────────────────────────────────────┘   │   │
│  │                                                           ┌──────────┐  │   │
│  │                                               [Cancel]   │ Create → │  │   │
│  │                                                           └──────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Design notes:**
- "Text" tab **removed** — [File] [🔒 Secret] only
- "Secret" tab uses the teal `#4ECDC4` border when active (consistent with active mode-toggle style)
- "NEW" badge is a small teal chip — removed after first use / after a version
- The expiry options use radio buttons, not a dropdown — more scannable and mobile-friendly
- Default: 1 view + 24 hours — shown first, no action required for most use cases
- "Create →" button uses the `upload-next-btn` style (teal, 54px height)
- The step indicator remains visible but steps 2–4 are skipped internally
- Character count shown below textarea
- No max_downloads=0 option in Phase 1 (unlimited views defeats the purpose of a "secret")

---

## Screen B — Encrypting (Progress State)

After clicking "Create →", a brief progress state (typically <1s for short text).

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  [Header]                                                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  ● Upload ────── ○ Deliver ────── ○ Share ────── ○ Confirm ─── ○ Done   │   │
│  │                                                                          │   │
│  │                                                                          │   │
│  │              ╔══════════════════════════════════════╗                   │   │
│  │              ║                                      ║                   │   │
│  │              ║      🔒  Encrypting your secret      ║                   │   │
│  │              ║                                      ║                   │   │
│  │              ║   ████████████████░░░░░░░░░░░░░░░   ║                   │   │
│  │              ║   AES-256-GCM · Key never leaves     ║                   │   │
│  │              ║   your device                        ║                   │   │
│  │              ║                                      ║                   │   │
│  │              ╚══════════════════════════════════════╝                   │   │
│  │                                                                          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Design notes:**
- Short text encrypts in <100ms — this screen may flash briefly or be skipped
- For longer text (>1MB), show a proper progress bar
- Messaging emphasises the privacy model: "Key never leaves your device"

---

## Screen C — Done: Link Created

The share link is displayed. This is the most important screen for the sender.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  [Header]                                                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  ○ Upload ────── ○ Deliver ────── ○ Share ────── ○ Confirm ─── ● Done   │   │
│  │                                                                          │   │
│  │  🔒  Secret link created                                                 │   │
│  │                                                                          │   │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │   │
│  │  │                                                                  │   │   │
│  │  │  Share this link:                                                │   │   │
│  │  │                                                                  │   │   │
│  │  │  ╔══════════════════════════════════════════════════════════╗   │   │   │
│  │  │  ║  https://send.sgraph.ai/en-gb/s/a3f8c1#K7mNpQ2...      ║   │   │   │
│  │  │  ╚══════════════════════════════════════════════════════════╝   │   │   │
│  │  │                                           [ 📋 Copy Link ]      │   │   │
│  │  │                                                                  │   │   │
│  │  │  ┌──────────────────────────────────────────────────────────┐   │   │   │
│  │  │  │  ⚠  This link can be viewed 1 time · Expires in 24h     │   │   │   │
│  │  │  │     Once viewed, the secret is permanently deleted        │   │   │   │
│  │  │  └──────────────────────────────────────────────────────────┘   │   │   │
│  │  │                                                                  │   │   │
│  │  │  ─────────────────────────────────────────────────────────────  │   │   │
│  │  │                                                                  │   │   │
│  │  │  Optional: save the kill link to delete this secret early        │   │   │
│  │  │                                                                  │   │   │
│  │  │  ╔══════════════════════════════════════════════════════════╗   │   │   │
│  │  │  ║  https://send.sgraph.ai/en-gb/s/kill/a3f8c1#...auth... ║   │   │   │
│  │  │  ╚══════════════════════════════════════════════════════════╝   │   │   │
│  │  │  [ 📋 Copy Kill Link ]   ⓘ Use this to delete before viewing   │   │   │
│  │  │                                                                  │   │   │
│  │  │  ─────────────────────────────────────────────────────────────  │   │   │
│  │  │                                                                  │   │   │
│  │  │  [ 📧 Email Link ]    [ 🔄 Create Another Secret ]              │   │   │
│  │  │                                                                  │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │   │
│  │                                                                          │   │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │   │
│  │  │  🔒 The server holds only encrypted ciphertext.                  │   │   │
│  │  │     The decryption key is embedded in the link — it never        │   │   │
│  │  │     leaves your browser.                                          │   │   │
│  │  └──────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Design notes:**
- Share link is in a prominent, single-line box with a "Copy Link" button
- The ephemerality notice uses the warning amber colour `#E07C4F` — this is important information
- Kill link is visually subordinate (secondary section, smaller text) — most users won't need it
- "Email Link" pre-populates `mailto:?subject=...&body=...` with the share link only (NOT the kill link)
- "Create Another Secret" resets the form
- The transparency panel at the bottom reinforces the zero-knowledge property
- QR code is optional for Phase 2 (most secrets shared digitally, not in-person)

---

## Screen D — Recipient: Secret View Page (`/en-gb/s/{id}#{key}`)

This is a new lightweight page. Clean, focused, unmistakably "this is sensitive".

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  SG/Send  🔒                                               sgraph.ai            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│                       ┌─────────────────────────────────────┐                  │
│                       │                                     │                  │
│                       │  🔒  Secret Message                 │                  │
│                       │                                     │                  │
│                       │  ──────────────────────────────     │                  │
│                       │                                     │                  │
│                       │  WiFi password: Apricot#9823        │                  │
│                       │                                     │                  │
│                       │  ──────────────────────────────     │                  │
│                       │                                     │                  │
│                       │           [ 📋 Copy ]               │                  │
│                       │                                     │                  │
│                       │  ┌─────────────────────────────┐   │                  │
│                       │  │ ⚠  This secret was deleted  │   │                  │
│                       │  │    from the server after     │   │                  │
│                       │  │    you opened this link.     │   │                  │
│                       │  │    No copy remains.          │   │                  │
│                       │  └─────────────────────────────┘   │                  │
│                       │                                     │                  │
│                       │  Decrypted in your browser ·        │                  │
│                       │  Server never saw this text         │                  │
│                       │                                     │                  │
│                       │  ─────────────────────────────      │                  │
│                       │  Want to share your own secret?     │                  │
│                       │  [ → Try SG/Send ]                  │                  │
│                       │                                     │                  │
│                       └─────────────────────────────────────┘                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Design notes:**
- Header is minimal — just the SG/Send logo and lock icon. No navigation. No distractions.
- The secret text is displayed in a card with a monospace font (`JetBrains Mono`) — it looks like what it is (a credential/code/key)
- "Copy" button is prominent — the most common action after reading
- The ephemerality notice is shown **after** the text, not before. Reading comes first.
- "Decrypted in your browser" is a one-line trust signal, not a wall of text
- The "Try SG/Send" CTA is the only marketing element — soft and at the bottom
- For N-view mode (not already exhausted): instead of "deleted" notice, show "X views remaining"

---

## Screen E — Recipient: Already Viewed

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  SG/Send  🔒                                               sgraph.ai            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│                       ┌─────────────────────────────────────┐                  │
│                       │                                     │                  │
│                       │  👁  Already Viewed                 │                  │
│                       │                                     │                  │
│                       │  This secret has already been       │                  │
│                       │  viewed and deleted.                │                  │
│                       │                                     │                  │
│                       │  If you haven't seen it yet,        │                  │
│                       │  ask the sender to create a new     │                  │
│                       │  secret link.                       │                  │
│                       │                                     │                  │
│                       │  ─────────────────────────────      │                  │
│                       │  Was this link intercepted?         │                  │
│                       │  → If you suspect this, let the     │                  │
│                       │    sender know immediately.         │                  │
│                       │                                     │                  │
│                       └─────────────────────────────────────┘                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Design notes:**
- No ambiguity: "already viewed and deleted" — not "not found" or "error"
- The security implication is surfaced: "Was this link intercepted?" — this is a genuine security signal worth surfacing. If you haven't seen the secret and the link is already dead, something is wrong.
- No "try again" button — there's nothing to try. The secret is gone.
- Clean, calm tone. This is not an error page — it's expected behaviour.

---

## Screen F — Recipient: Expired

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  SG/Send  🔒                                               sgraph.ai            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│                       ┌─────────────────────────────────────┐                  │
│                       │                                     │                  │
│                       │  ⏱  Expired                        │                  │
│                       │                                     │                  │
│                       │  This secret has expired.           │                  │
│                       │  The sender set a time limit and    │                  │
│                       │  it has passed.                     │                  │
│                       │                                     │                  │
│                       │  Ask the sender to create a new     │                  │
│                       │  secret link.                       │                  │
│                       │                                     │                  │
│                       └─────────────────────────────────────┘                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen G — Recipient: Deleted by Sender

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  SG/Send  🔒                                               sgraph.ai            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│                       ┌─────────────────────────────────────┐                  │
│                       │                                     │                  │
│                       │  🗑  Deleted                        │                  │
│                       │                                     │                  │
│                       │  This secret was deleted by the     │                  │
│                       │  sender before it was viewed.       │                  │
│                       │                                     │                  │
│                       │  Ask the sender to create a new     │                  │
│                       │  link if this was in error.         │                  │
│                       │                                     │                  │
│                       └─────────────────────────────────────┘                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen H — Sender: Kill Confirmation (`/en-gb/s/kill/`)

When the sender opens the kill link, they see a confirmation step before the secret is deleted.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  SG/Send  🔒                                               sgraph.ai            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│                       ┌─────────────────────────────────────┐                  │
│                       │                                     │                  │
│                       │  🗑  Delete Secret?                 │                  │
│                       │                                     │                  │
│                       │  This will permanently delete the   │                  │
│                       │  secret before it is viewed.        │                  │
│                       │                                     │                  │
│                       │  This cannot be undone.             │                  │
│                       │                                     │                  │
│                       │  ┌────────────┐  ┌──────────────┐  │                  │
│                       │  │  Cancel    │  │ 🗑 Delete Now │  │                  │
│                       │  └────────────┘  └──────────────┘  │                  │
│                       │                                     │                  │
│                       └─────────────────────────────────────┘                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Post-deletion:**
```
│                       │  ✓  Secret Deleted                  │
│                       │                                     │
│                       │  The secret has been permanently    │
│                       │  deleted. Anyone clicking the       │
│                       │  original link will see             │
│                       │  "Deleted by sender."               │
```

---

## Screen I — Focused Use-Case Page (Phase 2)

A standalone `/en-gb/secret/` page — no step indicator, no upload UI, just the secret form. For direct-link marketing ("Share a secret — try it now").

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  SG/Send  🔒   Zero-knowledge secret sharing              sgraph.ai  EN-GB ▼   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│           ┌──────────────────────────────────────────────────────────┐         │
│           │                                                          │         │
│           │   Share a Secret                                         │         │
│           │   ─────────────────────────────────────────────────     │         │
│           │   Encrypted in your browser. The server can't read it.  │         │
│           │   Auto-deletes after the recipient views it.             │         │
│           │                                                          │         │
│           │   ┌──────────────────────────────────────────────────┐  │         │
│           │   │                                                  │  │         │
│           │   │  Type or paste your secret here...               │  │         │
│           │   │                                                  │  │         │
│           │   │                                                  │  │         │
│           │   │                                                  │  │         │
│           │   └──────────────────────────────────────────────────┘  │         │
│           │   0 characters                                           │         │
│           │                                                          │         │
│           │   Expires:  [1 view ▼]   after   [24 hours ▼]          │         │
│           │                                                          │         │
│           │                          [ 🔒 Create Secret Link → ]    │         │
│           │                                                          │         │
│           └──────────────────────────────────────────────────────────┘         │
│                                                                                 │
│   🔒 How it works:                                                              │
│   Your text is encrypted in your browser · The key is embedded in the link    │
│   The server stores only encrypted bytes · Auto-deleted after viewing          │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Notes on Phase 2 focused page:**
- This is the "landing page" version — clean, no wizard, no tabs
- The expiry selectors are compact dropdowns, not radio buttons
- Suitable for sharing as `send.sgraph.ai/secret` in marketing materials
- Same underlying code — just a different page wrapper

---

## Design Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Default ephemerality | 1 view + 24h | Safest default; covers most use cases |
| Secret text font | JetBrains Mono | Credentials/keys read better in monospace |
| Expiry controls | Radio buttons (creation), Dropdowns (standalone page) | Radio better for first-time users; dropdowns better for power users |
| Kill link visibility | Secondary section, collapsible | Most users don't need it; power users will find it |
| Error state copy | Human, security-aware | "Was this intercepted?" is genuinely useful information |
| Recipient page navigation | Minimal — no upload CTA, no browse | Keep recipient focused; don't distract from the secret |
| Phase 1 URL | `/en-gb/s/{id}#{key}` | Consistent with existing URL structure; `/secret/` redirect in Phase 2 |
| N-view limit UI | Radio: 1 / 5 / 10 + custom | Most users pick 1; team use cases pick 5 |
