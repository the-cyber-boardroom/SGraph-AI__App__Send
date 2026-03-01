# Secure Message Delivery — Competitive Landscape Overview

**Document series:** SG/Send Competitive Debrief  
**Audience:** SG/Send Agentic Team (Business + Technical)  
**Status:** Reference Document

---

## What This Document Series Covers

This series documents a hands-on analysis of an incumbent secure message delivery product currently deployed at enterprise scale in a regulated industry (healthcare). The goal is to extract signal about where the market is, what assumptions incumbents have baked in, and where the opportunity for SG/Send lies.

The analysis covers:
- The end-to-end user journey (sender → email → recipient → read → reply)
- The underlying technical architecture (wire format, encryption model, key management)
- The security posture (what is and isn't actually protected)
- UX and design quality
- Business model characteristics

No confidential information was used. All findings are from first-principles observation of a message delivered to the analyst's own inbox.

---

## The Market in One Paragraph

Enterprise secure messaging for regulated industries (healthcare, legal, finance, government) is dominated by a small number of vendors who won deals in the 2005–2015 era. Their products were built before smartphones were ubiquitous, before browser crypto was viable, and before zero-knowledge architectures were mainstream. They are deeply embedded through compliance checkboxes, IT procurement cycles, and switching costs — not through product quality. Most are now owned by private equity or large security conglomerates. They are expensive, slow-moving, and architecturally dated. The compliance requirement they serve (encrypt PHI/PII in transit) is real and growing. The products serving that requirement are not.

---

## The Core Insight

**The incumbent market conflates "compliant" with "secure."**

These products achieve regulatory compliance (HIPAA, GDPR, UK DPA) by demonstrating that content is encrypted in transit and access-controlled at rest. What they do not achieve — and what they actively obscure — is true confidentiality. The service provider holds all decryption keys. Every message is readable by the vendor. The encryption protects against eavesdropping on the wire, not against the platform itself.

This is not a bug — it's a deliberate architecture choice that enables server-side features (search, audit logs, DLP scanning, anti-malware) — but it is a meaningful distinction that buyers do not understand and that creates real risk.

**SG/Send's opportunity:** be the product that is *actually* secure, not just compliant, while also being dramatically better to use.

---

## The Three Failure Modes of Incumbents

### 1. Security Theatre
The product performs visible security rituals (padlock icons, "Digital Signature is VALID" banners, AES-256 marketing) while holding all keys on its own servers. The user experiences the appearance of security without the reality of zero-knowledge protection.

### 2. UX Punishment
Recipients are forced through account registration, password creation, security questions, and portal login just to read a single message. The friction is so high that it trains users to associate "secure email" with frustration — the opposite of the intended outcome. Many users abandon or route around the system.

### 3. Feature Stagnation
Features that have been standard in consumer email for a decade — calendar integration, mobile-native rendering, structured actions, readable thread history — are absent or broken. The products feel like they were frozen in 2008 and maintained just enough to not stop working.

---

## Summary Scorecard

| Dimension | Incumbent | SG/Send Target |
|---|---|---|
| Encryption model | Server-custodied keys | Zero-knowledge, client-side |
| Provider can read content | Yes | No |
| Recipient registration required | Yes (account + password + security question) | No |
| Time to read first message | 5–10 minutes | < 60 seconds |
| Mobile experience | Poor (HTML attachment, portal login) | Native |
| Reply capability | Broken / severely restricted | First-class |
| Structured actions (calendar, confirm) | Absent | Built-in |
| Attachment handling | Server-side unpack and display | Zero-knowledge passthrough |
| Pricing model | Enterprise contract, per-seat | Usage-based |
| Architecture age | ~15–20 years | Modern |
| Open to inspection | No | Yes |

---

## Documents in This Series

| # | Title | Audience |
|---|---|---|
| 01 | **Competitive Landscape Overview** (this doc) | All |
| 02 | **Security Architecture Analysis** | Technical / Security |
| 03 | **User Journey & UX Analysis** | Product / Design |
| 04 | **Wire Format & Protocol Deep Dive** | Engineering |
| 05 | **Feature Gap Analysis & SG/Send Opportunities** | Product / Business |
