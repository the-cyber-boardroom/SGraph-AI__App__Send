# Feature Gap Analysis & SG/Send Opportunities

**Document series:** SG/Send Competitive Debrief — #05  
**Audience:** Product / Business  

---

## Overview

This document synthesises the competitive analysis into a structured opportunity map for SG/Send. Each gap in incumbent products is framed as a specific opportunity, with notes on business value, implementation feasibility, and priority.

---

## The Market Context

Enterprise secure messaging for regulated industries is a compliance-driven purchase. The buyer is typically IT/Security or Legal/Compliance. The user is always someone else — an external recipient who had no say in the tooling decision. This creates a persistent misalignment: the product is optimised for the buyer's checklist, not the user's experience.

The result is a stable but dissatisfied market. Incumbents renew because switching is painful and compliance requires *something*, not because their product is good. NPS scores for enterprise secure email products are consistently low. The opening for a challenger is real — but it requires winning on two fronts simultaneously: matching the compliance story for buyers, and dramatically outperforming on experience for users.

---

## Feature Gap Map

### 1. Zero-Knowledge Encryption

**Gap:** Incumbents hold all decryption keys server-side. They can read any message at any time.

**Opportunity:** True zero-knowledge architecture where server never sees plaintext. Cryptographically provable, not just contractually claimed.

**Business value:**
- Genuine differentiator for buyers who understand the distinction (legal, defence, finance, high-value healthcare)
- Eliminates vendor liability for content breaches
- Enables "we cannot produce content even under subpoena" positioning
- Reduces data processing obligations under GDPR (can't process what you can't see)

**Feasibility:** High. Web Crypto API is supported by all modern browsers. PBKDF2/Argon2 + AES-GCM is well-understood. The engineering challenge is UX, not cryptography.

**Priority:** 🔴 Core — this is the foundational differentiator

---

### 2. No-Registration Recipient Experience

**Gap:** Incumbents require recipients to create an account (name, password, security question) before reading their first message. This is the single largest source of friction and drop-off.

**Opportunity:** Passphrase-only access. Recipient enters a short passphrase communicated via a separate channel. No account. No password to remember. No portal to return to.

**Business value:**
- Dramatically higher message-read rates (reduces support burden on senders)
- Removes the onboarding barrier for low-frequency senders
- Eliminates the recipient credential database (a breach target that doesn't need to exist)
- Makes SG/Send viable for one-time sends, not just ongoing relationships

**Feasibility:** High. This is the design the zero-knowledge architecture naturally produces.

**Priority:** 🔴 Core

---

### 3. Structured Actions in Messages

**Gap:** Incumbents render messages as static HTML. There are no action affordances beyond Reply/Forward.

**Opportunity:** Sender-defined structured actions embedded in the message:
- **Healthcare:** "Add to Calendar" / "Confirm Attendance" / "Request Reschedule"
- **Legal:** "Sign Document" / "Acknowledge Receipt"
- **Finance:** "Approve" / "Reject" / "Request Clarification"
- **General:** "Confirm" / "Reply Securely" / custom CTA

Actions are defined by the sender at send time. Responses are encrypted and routed back through SG/Send.

**Business value:**
- Transforms secure messaging from a read-only compliance tool into an interactive workflow layer
- Significantly higher ROI for senders (appointment confirmations actually get confirmed)
- Structured responses enable downstream automation (calendar updates, CRM entries, EHR updates)
- Hard to replicate for incumbents whose architecture doesn't support it

**Feasibility:** Medium. Requires a sender-side composition API and recipient-side action handling. The reply routing needs careful design for the zero-knowledge model.

**Priority:** 🟡 High — strong differentiator, medium complexity

---

### 4. Proper Reply Workflow

**Gap:** Incumbent reply flow is broken by default due to whitelist misconfiguration. Even when working, replies are re-encrypted and re-delivered as new messages, breaking thread continuity.

**Opportunity:** First-class bidirectional conversation. Recipient reply is encrypted with the original passphrase (or a reply-specific derived key), stored as part of the thread, and notified to the sender. Full thread visible to both parties on next access.

**Business value:**
- Enables actual secure conversation, not just one-way delivery
- Reduces phone/unencrypted fallback for sensitive exchanges
- Thread history under one passphrase reduces friction for multi-message exchanges

**Feasibility:** Medium-high. Thread key derivation needs design thought. Notification of reply without revealing content is a solvable problem.

**Priority:** 🟡 High

---

### 5. Calendar & Structured Data Extraction

**Gap:** Even when messages contain fully structured data (date, time, location, person), incumbents provide no actions to use that data. Recipients must manually copy appointment details into their calendar.

**Opportunity:** Automatic `.ics` generation and "Add to Calendar" button when sender includes structured appointment data. SG/Send provides a sender-side schema for common data types; recipient view automatically renders appropriate actions.

**Business value:**
- High-frequency, high-value use case in healthcare, legal, financial advisory
- Measurable outcome (calendar add rate > message-read rate as success metric)
- Zero additional cost to implement; creates meaningful value

**Feasibility:** High. ICS generation is trivial. The sender-side schema is the only design work needed.

**Priority:** 🟡 High — low effort, high user value

---

### 6. Mobile-First Rendering

**Gap:** Incumbent portal is a fixed-width desktop layout. HTML attachment rendering varies by email client. Neither is optimised for mobile.

**Opportunity:** SG/Send recipient experience designed mobile-first. URL opens in browser (no attachment needed), renders responsively, touch targets sized correctly, actions (calendar, confirm) are large tap targets.

**Business value:**
- >50% of email is read on mobile — this is the primary use case, not an edge case
- Appointments and time-sensitive communications are especially likely to be read on phone
- Modern expectation: if a link doesn't work well on mobile it's broken

**Feasibility:** High. Standard responsive web design, no novel engineering.

**Priority:** 🔴 Core — table stakes for launch

---

### 7. Phishing-Resistant Delivery Pattern

**Gap:** The incumbent's HTML attachment auto-POSTs encrypted data to a server on page load. This pattern is structurally identical to a phishing payload. Users cannot distinguish the genuine product from a spoof.

**Opportunity:** SG/Send delivery is a plain URL link. No attachment. No auto-executing HTML. No hidden form fields. No JavaScript that runs before the user takes action. The URL is the trust signal; the domain is the credential.

**Business value:**
- Reduces phishing risk for recipients (no attachment to spoof)
- Reduces AV/mail filter false positives (no executable HTML attachment)
- Builds user trust through consistent, predictable pattern
- Potentially reduces corporate email delivery failures

**Feasibility:** High. No attachment is simpler than attachment.

**Priority:** 🔴 Core — architectural decision, not a feature

---

### 8. Proportional Encryption (Content-Aware Policies)

**Gap:** Incumbents apply encryption at the sender template/workflow level, not the content level. A generic FAQ document gets the same heavy-handed treatment as a pathology report.

**Opportunity:** Sender-side intelligence (manual tag or AI-assisted sensitivity detection) routes messages to appropriate protection levels:
- **Level 0:** Plain email (no sensitive content detected)
- **Level 1:** Link-only delivery (no attachment, passphrase not required, link-expiry only)
- **Level 2:** Passphrase-protected (zero-knowledge, requires out-of-band passphrase)
- **Level 3:** Passphrase + time-limited + restricted actions (for highest sensitivity)

**Business value:**
- Calibrates UX overhead to actual risk — removes false positives
- Prevents "secure email fatigue" that trains users to ignore security signals
- Positions SG/Send as intelligent, not blunt-force

**Feasibility:** Medium. Sender-side content classification is the hard part. The delivery tiers are straightforward.

**Priority:** 🟢 Medium-term — differentiated product vision, not MVP requirement

---

### 9. Transparent Architecture

**Gap:** Incumbent's security is a black box. Users and buyers must trust marketing claims about encryption. The actual protocol is proprietary and unauditable.

**Opportunity:** SG/Send publishes its complete cryptographic protocol specification. Open source client-side decryption code. Third-party audits published. "Trust but verify" positioning.

**Business value:**
- Strong signal to sophisticated buyers (enterprise security, government)
- Builds ecosystem trust that enables API/integration adoption
- Creates a moat through reputation, not obscurity
- Differentiates from incumbents who rely on opacity

**Feasibility:** High — this is a policy/publishing decision, not an engineering challenge.

**Priority:** 🟡 High — especially relevant for regulated industry buyers

---

### 10. Pricing Model

**Gap:** Incumbents are enterprise contracts, per-seat, annual commitment, high minimum spend. This excludes SMB, one-time senders, and developer use cases.

**Opportunity:** Usage-based pricing. Pay per send, per GB stored, or per successful message read. No minimum commitment. Free tier for low-volume senders.

**Business value:**
- Opens SMB and developer segments that incumbents ignore
- Creates natural growth path: low-volume users who scale become enterprise customers
- Aligns revenue with value delivered (only pay for messages that work)

**Feasibility:** High — operational/business decision.

**Priority:** 🔴 Core positioning decision

---

## Opportunity Prioritisation Matrix

```
                    HIGH IMPACT
                         │
   Zero-knowledge  ●     │     ● No-registration UX
   encryption            │     ● Mobile-first
   Phishing-resistant ●  │     ● Structured actions
   delivery              │
─────────────────────────┼──────────────────────────
   LOW EFFORT            │              HIGH EFFORT
                         │
   Calendar/ICS ●        │     ● Content-aware policies
   Pricing model ●       │     ● Bidirectional threads
   Transparent arch ●    │     ● Action workflow API
                         │
                    LOW IMPACT
```

---

## The Minimum Viable Difference

To be meaningfully competitive at launch, SG/Send needs to win on exactly three dimensions simultaneously:

1. **Compliance parity:** Satisfies the same regulatory checkboxes as incumbents (GDPR, HIPAA-equivalent, data at rest encrypted, access-controlled, audit log)
2. **Genuine security superiority:** Zero-knowledge model, demonstrably not readable by SG/Send
3. **Dramatically lower recipient friction:** No registration, < 60 seconds to first read, mobile-native

Everything else — structured actions, calendar integration, reply threads, AI-assisted classification — is a growth surface to build on top of these three pillars.

---

## Appendix: Questions Incumbents Cannot Answer

These are questions that SG/Send can answer definitively that incumbents cannot:

1. "Can you read my messages?" → SG/Send: **No, mathematically impossible.** Incumbent: *"We have strict policies..."*
2. "What happens if your platform is breached?" → SG/Send: **Attackers get ciphertext with no keys.** Incumbent: *"We have strong security..."*
3. "Can I read my message without creating an account?" → SG/Send: **Yes, in under 60 seconds.** Incumbent: *"You'll need to register first..."*
4. "Can I add this appointment to my calendar?" → SG/Send: **One tap.** Incumbent: *[no response — feature doesn't exist]*
5. "Can I see your protocol specification?" → SG/Send: **Yes, here's the link.** Incumbent: *"That's proprietary..."*
