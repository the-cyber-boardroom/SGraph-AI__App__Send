# Security Architecture Analysis — Incumbent Secure Email

**Document series:** SG/Send Competitive Debrief — #02  
**Audience:** Technical / Security  

---

## Architecture Overview

The incumbent's architecture follows a **server-custodied encryption** model. At no point does the recipient hold a decryption key. The sequence is:

```
Sender (enterprise) 
  → MTA Gateway (encrypts message with AES-256)
  → Key stored in vendor key server
  → Encrypted blob transmitted via email to recipient
  → Recipient clicks link / opens attachment
  → Browser POSTs encrypted blob to vendor server
  → Vendor server calls internal key server by message UUID
  → Server decrypts plaintext server-side
  → Rendered HTML returned to recipient's browser over TLS
```

The decryption happens entirely on vendor infrastructure. The recipient's browser receives plaintext HTML, not ciphertext + key.

---

## Key Management

The key server is referenced inside the encrypted document format itself via an internal URL (e.g., `localhost:8080/ks/ks`). This means:

- Keys are stored server-side, indexed by a message UUID
- A bearer token (the message ID in the portal URL) is the only authentication required to trigger key retrieval for non-registered users
- Registered users additionally authenticate with portal credentials before key retrieval
- The vendor has **unrestricted access to all message content at all times**

### Implications

| Claim | Reality |
|---|---|
| "AES-256 encrypted" | True — in transit between sender MTA and vendor gateway, and at rest on vendor servers |
| "Only you can read it" | False — the vendor can decrypt any message at any time |
| "End-to-end encrypted" | False — the vendor is in the middle with the keys |
| GDPR-compliant | Technically yes — vendor is a data processor under DPA |
| Zero-knowledge | No — antithetical to their architecture |

---

## The Encrypted Document Format

The wire format is a proprietary XML-based secure document format (Sigaba/SiGaBa lineage, circa 2001). Structure:

```xml
<secure-doc xmlns="http://[vendor]/2001/3/common/document"
  v="7" mv="3" rv="1"
  ksURL="http://localhost:8080/ks/ks"
  ty="SSMAIL"
  id="[message-uuid]"
  len="[plaintext-byte-count]"
  ct="application/octet-stream">
  
  <encrypted-data en="Base64" ci="AES-256" co="Gzip">
    [base64 of gzipped AES-256 ciphertext]
  </encrypted-data>
  
  <signature-data en="Base64" co="Gzip">
    [X.509 certificate chain + digital signature]
  </signature-data>
  
  <identity-data en="Base64" co="Gzip">
    [sender identity verification data]
  </identity-data>
  
</secure-doc>
```

Key observations:
- The format is ~25 years old and shows it
- The `ksURL` field in the document is what routes decryption to the vendor's key server
- All three sub-blobs are independently gzipped then base64 encoded
- The signature data allows the portal to display "Digital Signature is VALID" — this is meaningful (sender authenticity) but cosmetic to most users
- Format is binary-opaque to the recipient; no open specification

---

## Transport Wrapper

The encrypted document is wrapped in an HTML form before email delivery:

- An HTML file (~93KB typical) containing 45 hidden `<input>` fields
- Each field holds a 1,925-character base64 chunk of the encrypted payload
- On page load, JavaScript auto-submits the form via POST to the vendor's decryption endpoint
- No user interaction required — opening the file triggers the POST

This approach predates: the `fetch()` API, CORS, CSP, and modern browser security models. It is a relic of an era when form-POST was the only reliable browser→server mechanism.

**Security implication:** This is structurally identical to a phishing payload. An attacker could construct a convincing clone of this exact pattern. Users cannot distinguish the genuine article from a spoofed version.

---

## Email Authentication

The system does implement proper email authentication:

- **DKIM:** Signed by the vendor's sending infrastructure (`selector: pps1`), properly aligned with the `From` domain
- **SPF:** Pass via vendor's MTA IP ranges
- **DMARC:** Policy `p=QUARANTINE`, properly aligned — spoofed versions would fail DMARC and be quarantined by major mail providers

This is the strongest part of the security model. The authentication chain from sender domain → vendor MTA → recipient MX is solid.

---

## Recipient Identity & Access Control

Metadata about the recipient and permissions is stored in a separate XML envelope (`rcptData`) transmitted alongside the encrypted payload:

```xml
<CourierOptionData>
  <reply-enabled>true</reply-enabled>
  <reply-all-enabled>true</reply-all-enabled>
  <forward-enabled>false</forward-enabled>
  <initiate-enabled>false</initiate-enabled>
  <include-original>true</include-original>
  <digest>[HMAC-SHA256 of metadata]</digest>
</CourierOptionData>
```

The subject line and other metadata use a trivially reversible letter-pair substitution encoding (each character mapped to two letters A–P as hex nibbles). This is obfuscation, not encryption.

---

## What SG/Send Does Differently

The fundamental architectural alternative is **zero-knowledge passthrough**:

```
Sender 
  → Encrypts content client-side using passphrase-derived key (PBKDF2/Argon2)
  → Uploads ciphertext to SG/Send storage
  → Sends recipient a link + communicates passphrase out-of-band
  → Recipient opens link, enters passphrase
  → Browser derives key locally, decrypts ciphertext locally
  → Plaintext never leaves recipient's device; server never sees it
```

Key differences:

| Property | Incumbent | SG/Send (zero-knowledge) |
|---|---|---|
| Server sees plaintext | Yes, on every read | Never |
| Keys stored server-side | Yes | No keys to store |
| Offline decryption possible | No | Yes (with passphrase) |
| Key server single point of failure | Yes | Eliminated |
| Compatible with open audit | No | Yes |
| Cryptographic guarantee | None | Mathematical |

---

## Threat Model Comparison

### Threats the incumbent protects against:
- ✅ Wire interception (TLS in transit)
- ✅ Unauthorised third-party access (portal authentication)
- ✅ Email spoofing (DKIM/DMARC)
- ✅ Message tampering (digital signature)

### Threats the incumbent does NOT protect against:
- ❌ Vendor employee accessing message content
- ❌ Vendor infrastructure breach (all plaintext accessible post-decryption)
- ❌ Legal compulsion of vendor to produce message content
- ❌ Insider threat at vendor
- ❌ Vendor platform compromise at key server level

### Threats SG/Send zero-knowledge model protects against (additionally):
- ✅ All of the above
- ✅ Provider cannot produce plaintext even under subpoena (nothing to produce)
- ✅ Platform breach exposes only ciphertext (useless without passphrase)
- ✅ No key server to compromise

---

## Password Policy & Account Security

The recipient portal password policy observed:
- Minimum 7 characters, **maximum 20 characters** (truncation risk)
- Requires digit + symbol
- Security question recovery ("Your childhood best friend")
- No MFA mentioned or observed

The 20-character maximum is a particularly significant weakness — it suggests passwords are likely stored with a reversible or fixed-width algorithm, not a modern adaptive hash (bcrypt/Argon2). The security question is 2005-era account recovery that provides a low-entropy bypass to the password entirely.

---

## Summary

The incumbent's security model is compliance-oriented, not security-oriented. It satisfies regulatory checkbox requirements (content encrypted in transit, access-controlled portal) while maintaining full server-side visibility into all content. For organisations with genuine confidentiality requirements — not just compliance requirements — this model offers weaker guarantees than it appears to, while imposing significant UX overhead on recipients.
