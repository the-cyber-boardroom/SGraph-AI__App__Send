# User Journey & UX Analysis — Incumbent Secure Email

**Document series:** SG/Send Competitive Debrief — #03  
**Audience:** Product / Design  

---

## Overview

This document maps the complete recipient experience of an incumbent enterprise secure email product, step by step, with annotations on friction points, UX anti-patterns, and missed opportunities. The context is a healthcare appointment confirmation sent to a patient — a high-frequency, high-stakes touchpoint.

---

## Complete Recipient Journey

### Step 0: The Email Arrives

The recipient receives a plain wrapper email in their inbox. The wrapper contains:
- A short paragraph explaining there is a secure message waiting
- A portal link (expires in ~1 year)
- An attached HTML file ("attachment" fallback)
- No preview of content whatsoever

**Friction:** The recipient has no idea what the message is about, whether it's urgent, or whether it's spam. The sending domain is the vendor's relay address, not the organisation's, which trains phishing recognition in reverse.

**Missed opportunity:** Even a generic category ("You have received an appointment confirmation") without sensitive specifics would dramatically improve open/action rates.

---

### Step 1: Click the Portal Link

Browser opens the vendor's secure reader portal at the organisation's branded subdomain.

**If first-time recipient:**

→ Full account registration form:
- Email address (pre-populated, read-only)
- First name
- Last name  
- Password (7–20 characters, digit + symbol required)
- Confirm password
- Security question (dropdown)
- Security question answer

Then click "Continue."

**Estimated time to complete:** 2–4 minutes for a typical user, longer for elderly or low-digital-literacy users.

**Friction points:**
- Password policy maximum of 20 characters penalises users with good password hygiene
- No password manager autofill works cleanly due to the pre-populated read-only email field
- Security question is a recognised anti-pattern (low entropy, social engineering risk)
- No explanation of why registration is required
- No indication of what the message contains or whether this registration is worth the effort
- No "Sign in with Google/Microsoft" option
- No passkey/WebAuthn support

**If returning recipient:** Login screen with username + password. Forgotten password flow requires security question answer. No MFA.

---

### Step 2: Read the Message

After authentication, the message renders in a webmail-style portal interface.

**Layout:**
- Inbox pane (left sidebar)
- Message view (main panel)
- Reply / Reply All buttons (header)
- "Digital Signature is VALID ✓" badge
- Attachment listed (if any)

**Rendering issues observed:**
- HTML email tables render with visible nested bounding boxes — the portal's CSS does not neutralise the email's own border attributes
- Images in the quoted HTML render inconsistently
- No responsive layout — desktop-width fixed layout on mobile

**Missing features:**
- No "Add to Calendar" button (despite having all structured data: date, time, location, consultant)
- No "Confirm appointment" / "Request reschedule" action buttons
- No print-optimised view
- No accessible/plain-text view toggle

---

### Step 3: Download Attachment

Attachment downloads via the portal. File is served from the vendor's CDN.

**Observation:** In the case analysed, the PDF attachment contained no personalised or sensitive data — it was a generic FAQ document. The encryption infrastructure was applied uniformly to all messages from this sender template, regardless of whether individual messages contained sensitive content.

---

### Step 4: Attempt to Reply

**The reply flow is broken.**

The portal exposes Reply and Reply All buttons. Clicking Reply opens a compose interface pre-populated with:
- To: [organisation's sending alias]
- Cc: [recipient's own email address]
- Subject: RE: [original subject]

**What happens when you try to send:**
- To: [organisation email] → "Invalid Addresses. For assistance, please contact your administrator"
- To: [own email] → succeeds, but sends the message to yourself
- The reply is re-encrypted and delivered as a new secure message to the sender you specified

**Root cause:** The portal's outbound routing is restricted to a whitelist of authorised recipient addresses. The organisation's own sending alias is not configured as a valid reply-to target — a misconfiguration that makes the reply feature entirely non-functional for its primary use case.

**Downstream effect:** The reply that does succeed (to self) is processed by the vendor's infrastructure as a new outbound secure message, using the organisation's tenant as the relay. The "from" becomes "[Recipient Name] via [Organisation] Email Encryption" with a `encryption-service@[org-domain]` address. This is unexpected, confusing, and potentially a misuse concern.

---

### Step 5: The Help Documentation

The help page (`/help/enus_encryption.htm`) is a static HTML document covering:
- Receiving encrypted email
- Replying or forwarding
- Adding recipients
- Adding attachments
- Reading on a smartphone
- Resetting expired password
- Troubleshooting

**Observations:**
- Plain static HTML, no search, no interactivity
- Language and structure consistent with technical documentation written circa 2008–2012
- "Reading a Secure Message on a Smart Phone" treated as a special-case edge case, not the primary path
- Password expiry mentioned as a normal ongoing maintenance task for recipients
- The existence of a "Resetting Your Expired Password" section implies recipients are expected to return to this system repeatedly — but the UX does nothing to reduce re-authentication friction

---

## UX Anti-Pattern Inventory

| Anti-Pattern | Where Observed | Impact |
|---|---|---|
| Mandatory account registration to read content | Step 1 | High drop-off, support burden |
| Security question account recovery | Step 1 | Low-entropy bypass, 2005-era pattern |
| Password maximum length (20 chars) | Step 1 | Penalises good password hygiene |
| No SSO / social login | Step 1 | Adds yet another password to manage |
| Wrapper email reveals no content category | Step 0 | Low open/action rates, phishing confusion |
| Sending domain is vendor relay, not org | Step 0 | Trains users to accept suspicious-looking domains |
| Auto-submitting HTML form attachment | Step 0 | Indistinguishable from phishing; triggers AV |
| No structured actions (calendar, confirm) | Step 2 | Forces manual re-entry of structured data |
| Broken reply flow | Step 4 | Core use case (bidirectional comms) non-functional |
| CSS conflict in quoted HTML rendering | Step 2 | Unprofessional, confusing table borders |
| Desktop-first fixed-width layout | Step 2 | Poor mobile experience |
| Static help documentation | Step 5 | Unhelpful for non-technical users |
| Password expiry requiring periodic resets | Ongoing | Ongoing friction for infrequent users |

---

## Measured Journey Time

| Scenario | Estimated Time to First Message Read |
|---|---|
| First-time recipient, portal link | 5–10 minutes |
| First-time recipient, HTML attachment | 3–5 minutes |
| Returning recipient, remembers password | 1–2 minutes |
| Returning recipient, forgot password | 5–8 minutes (security question flow) |
| SG/Send target (passphrase model) | < 60 seconds |

---

## The Proportionality Problem

The UX overhead observed is constant regardless of message sensitivity. A generic informational notice and a sensitive pathology result impose identical friction on the recipient. This is because encryption is applied at the sender workflow level (template-based), not at the content sensitivity level.

This creates a paradox: the system trains recipients to find secure messaging burdensome, which reduces compliance with the security mechanism itself. Patients who find the portal too difficult will phone the organisation's reception desk and request the information be re-sent unencrypted or read aloud — a significantly worse security outcome.

---

## What Good Looks Like

For a healthcare appointment confirmation, the ideal recipient experience:

1. Receive email with organisation's own domain in From field
2. Click one link
3. Enter a short passphrase communicated via a separate channel (SMS, prior knowledge, appointment reference number)
4. Message renders natively in browser, mobile-optimised
5. Single-tap "Add to Calendar" creates `.ics` entry
6. Single-tap "Confirm attendance" or "Request reschedule" routes structured response back to sender
7. No account, no password to remember, no portal to return to
8. Passphrase may be reused for future messages from same organisation if desired

This is achievable today with Web Crypto API, modern browser capabilities, and a zero-knowledge backend. It requires rethinking the problem from the recipient's perspective, not from the sender's compliance checklist.
