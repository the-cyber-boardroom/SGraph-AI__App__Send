# Research Brief: Privacy Classification of HTTP Request Metadata for a Zero-Knowledge File Sharing Service

## Context

We are building SGraph Send, a zero-knowledge encrypted file sharing service. The core security promise is: **the entire server-side dataset can be exposed with zero privacy impact.** Files are encrypted client-side (AES-256-GCM) before upload — the server never sees plaintext content or decryption keys.

However, we also capture HTTP request metadata on each transfer event (upload and download). This metadata is stored in S3 as JSON (events.json and meta.json) alongside the encrypted payload. If our "full compromise = zero impact" promise is to hold, **every field we store must be non-sensitive, or must be anonymised before storage.**

## What We Currently Capture (or Could Capture)

On each HTTP request to our API (FastAPI on Lambda behind API Gateway/CloudFront), we have access to the following data from the request:

1. **IP address** (from X-Forwarded-For or request.client.host)
2. **User-Agent header** (browser name, version, OS)
3. **Accept-Language header** (preferred languages)
4. **Referer header** (referring URL, if any)
5. **Timestamp** (server-side, UTC)
6. **CloudFront headers** (if present):
   - CloudFront-Viewer-Country
   - CloudFront-Viewer-City
   - CloudFront-Viewer-Region (state/province)
   - CloudFront-Viewer-Postal-Code
   - CloudFront-Viewer-Latitude
   - CloudFront-Viewer-Longitude
   - CloudFront-Viewer-Time-Zone
   - CloudFront-Is-Mobile-Viewer / CloudFront-Is-Desktop-Viewer / CloudFront-Is-Tablet-Viewer
   - CloudFront-Viewer-ASN (Autonomous System Number — identifies the ISP/network)
7. **TLS metadata** (cipher suite, TLS version — from CloudFront)
8. **Request metadata** (HTTP method, path, query parameters, content-length)

If we additionally use an IP enrichment service (e.g., ipdata.co, MaxMind), we could derive:
9. **Geolocation** (country, region/state, city, postal code, latitude, longitude)
10. **ISP / Organisation name**
11. **ASN (Autonomous System Number)**
12. **Connection type** (residential, business, hosting, education)
13. **VPN / proxy / Tor detection**
14. **Threat intelligence** (known malicious IP, spam source, etc.)

## Questions to Research

### Question 1: Privacy Classification of Each Field

For each data point listed above (1–14), classify it as:

- **PII (Personally Identifiable Information)** — directly or indirectly identifies a natural person
- **Quasi-identifier** — not PII alone but could identify a person when combined with other fields
- **Non-personal** — cannot reasonably identify a person

Consider the classification under:
- **GDPR** (EU — Article 4(1) definition of personal data, Recital 30 on IP addresses)
- **CCPA/CPRA** (California — definition of personal information)
- **UK Data Protection Act 2018 / UK GDPR**
- **ePrivacy Directive** (cookie/tracking implications)
- **LGPD** (Brazil — since we plan Portuguese language support)

Specifically address: **Is an IP address always PII under GDPR?** Cite the Breyer v Germany (C-582/14) CJEU ruling and its implications. Are there circumstances where an IP address is NOT personal data?

### Question 2: The Anonymisation Boundary

For each field classified as PII or quasi-identifier:

- **Can it be anonymised via one-way hashing (e.g., SHA-256)?** If we store `SHA-256(IP_address + daily_salt)` instead of the raw IP, does this satisfy GDPR anonymisation requirements? Or is it merely pseudonymisation (which is still personal data under GDPR)?
- **What is the difference between anonymisation and pseudonymisation under GDPR**, and which side does hashing fall on?
- **Does salted hashing with a rotating salt (e.g., daily rotation, salt discarded after rotation) change the classification?** If we cannot reverse the hash AND the salt is destroyed, is it now truly anonymous?
- **What about HMAC with a server-held key vs SHA-256 with a discarded salt?** Which approach is more defensible?

### Question 3: Geolocation Granularity — Where Is the Line?

If we derive geolocation from IP addresses (either via CloudFront headers or IP enrichment), which granularity levels are safe to store in plaintext without anonymisation?

Evaluate each level:
- **Country** (e.g., "United Kingdom") — is this personal data?
- **Region/State** (e.g., "England", "California") — personal data?
- **City** (e.g., "London", "Manchester") — personal data?
- **Postal code / ZIP code** — personal data? (Note: UK postcodes can narrow to ~15 households; US ZIP codes vary widely)
- **Latitude/Longitude** (IP-derived, typically accurate to city level, ~5-25km radius) — personal data?
- **Exact coordinates** (GPS-level) — obviously personal data, but we don't have this

What is the **safe storage line** — the granularity at which geolocation data is generally considered non-identifying and can be stored alongside encrypted transfer metadata without creating a privacy risk?

Consider the **k-anonymity** principle: if a stored location value describes a population of >N people, is it safe? What N is generally accepted?

### Question 4: What Should We Store vs Derive vs Discard?

Given our zero-knowledge promise, propose a three-tier classification for all fields:

**Tier 1 — Store in plaintext** (non-sensitive, safe to expose in a breach):
- Which fields can we store as-is without any privacy concern?

**Tier 2 — Store as anonymised hash** (useful for analytics but not reversible):
- Which fields should be hashed before storage?
- What hashing scheme? (algorithm, salt strategy, rotation)
- What analytics are possible from hashed values? (e.g., "same IP uploaded and downloaded" → possible via hash comparison, without knowing the IP)

**Tier 3 — Never store** (discard after request processing):
- Which fields should never be written to S3/disk?
- Can they be used ephemerally (e.g., for rate limiting in Lambda memory) without being persisted?

### Question 5: The User-Agent Problem

The User-Agent string is a known fingerprinting vector. A specific User-Agent combined with other fields (IP, language, timezone) can uniquely identify a user.

- Should we store the full User-Agent? A truncated version (just browser family + OS)? A hash?
- What is the EFF Panopticlick / Cover Your Tracks research say about User-Agent entropy?
- Is a normalised User-Agent (e.g., "Chrome/Windows" instead of the full string) sufficient for our analytics while being non-identifying?

### Question 6: Transparency Panel Implications

Our product has a unique feature: a **transparency panel** that shows users exactly what metadata we captured about them. This creates a tension:

- We WANT to show the user their real IP, geolocation, and user-agent (for transparency and education)
- We DON'T WANT to store that same data on the server (for privacy)

**Can we display data to the user in real-time (derived from their request) without storing it?** This would mean the transparency panel shows live data that is never persisted. The stored version would only contain the anonymised/safe fields.

Is this approach (show live, store anonymised) legally and technically sound? Are there any regulatory requirements to store what we show, or can we show-then-discard?

### Question 7: Practical Recommendation

Given all the above, produce a concrete recommendation:

```
FIELD                          SHOW TO USER    STORE ON SERVER     FORMAT STORED
─────────────────────────────────────────────────────────────────────────────
IP address                     ?               ?                   ?
User-Agent                     ?               ?                   ?
Accept-Language                ?               ?                   ?
Timestamp                      ?               ?                   ?
Country                        ?               ?                   ?
Region/State                   ?               ?                   ?
City                           ?               ?                   ?
Postal code                    ?               ?                   ?
Latitude/Longitude             ?               ?                   ?
ISP/Organisation               ?               ?                   ?
ASN                            ?               ?                   ?
Connection type                ?               ?                   ?
VPN/Proxy/Tor flag             ?               ?                   ?
Device type (mobile/desktop)   ?               ?                   ?
TLS version                    ?               ?                   ?
```

For the "FORMAT STORED" column, specify exactly what is written to our events.json/meta.json. Options: raw value, hashed value (specify scheme), truncated value, boolean flag, discarded.

## Constraints

- We are a UK-based company with EU/global users
- We must comply with GDPR, UK GDPR, and ideally LGPD
- Our threat model assumes full server compromise (all S3 data exposed)
- We prefer to store LESS data, not more — our brand is privacy-first
- We need enough data for: abuse detection, rate limiting, basic usage analytics (transfers per country, downloads over time), and the transparency panel
- We do NOT need: user tracking, marketing analytics, behavioral profiling, or ad targeting

## Output Format

Structure your response with clear headings matching the 7 questions above. Cite specific regulations, court cases, and guidance documents (e.g., Article 29 Working Party opinions, EDPB guidelines, ICO guidance). Include the practical recommendation table as the final section.
