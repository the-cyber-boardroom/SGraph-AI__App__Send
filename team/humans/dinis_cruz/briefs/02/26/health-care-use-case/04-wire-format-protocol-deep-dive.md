# Wire Format & Protocol Deep Dive — Incumbent Secure Email

**Document series:** SG/Send Competitive Debrief — #04  
**Audience:** Engineering  

---

## Overview

This document details the technical wire format used by an incumbent enterprise secure email system, reconstructed through first-principles analysis of a received message. This is useful for understanding design decisions to replicate, avoid, or deliberately improve upon in SG/Send's own protocol design.

---

## Email Structure (MIME)

```
multipart/mixed  [BOUNDARY_1]
├── multipart/alternative  [BOUNDARY_2]
│   ├── text/plain
│   │   └── Fallback plaintext with portal URL
│   └── multipart/related  [BOUNDARY_3]
│       ├── text/html
│       │   └── Wrapper email body (logo + instructions)
│       ├── image/png  (cid: logo)
│       │   └── ~65KB inline organisation logo
│       └── image/gif  (cid: padlock icon)
│           └── ~10KB padlock graphic
└── text/html  [attachment]
    └── SecureMessage.html (~93KB)
        └── Self-submitting form with 45 hidden inputs
            └── Chunked base64 of encrypted payload
```

Total email size: ~170KB for a short appointment confirmation message.

**Comparison baseline:** A plain-text appointment confirmation email is typically 5–15KB. The secure wrapper adds ~10–15× overhead.

---

## The HTML Attachment — Technical Detail

The HTML attachment is the primary delivery mechanism for offline/fallback access. It is a standalone file designed to work without internet connection up to the point of form submission.

### Structure

```html
<html>
<body onload="document.forms[0].submit()">
  <form method="POST" 
        action="https://[vendor-host]/formpostdir/safeformpost.aspx">
    <input type="hidden" name="msg0"  value="[1925 chars base64]">
    <input type="hidden" name="msg1"  value="[1925 chars base64]">
    ...
    <input type="hidden" name="msg43" value="[1925 chars base64]">
    <input type="hidden" name="msg44" value="[827 chars base64]">  <!-- last chunk, variable length -->
    <input type="hidden" name="rcptdata" value="[base64 XML metadata]">
    <!-- fallback UI for JS-disabled browsers -->
    <noscript>
      <p>Click the button to access your secure message.</p>
      <input type="submit" value="Click to read message">
    </noscript>
  </form>
</body>
</html>
```

### Chunking Arithmetic

```
45 chunks × 1,925 chars/chunk = 85,527 base64 chars
(minus last chunk shortfall)
Base64 decode → 63,312 bytes binary
Binary = encrypted secure-doc XML payload
```

The 1,925-character chunk size appears to be chosen to stay under URL/cookie length limits from a legacy era, applied mechanically to form POST fields where no such limit applies. It is an architectural fossil.

---

## The Encrypted Payload — Secure-Doc Format

The 63KB binary decodes to a proprietary XML format:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<secure-doc 
  xmlns="http://[vendor-domain]/2001/3/common/document"
  v="7" mv="3" rv="1"
  ksURL="http://localhost:8080/ks/ks"
  ty="SSMAIL"
  f="BINARY"
  id="[uuid-v4-message-identifier]"
  len="121709"
  ct="application/octet-stream">

  <encrypted-data en="Base64" ci="AES-256" co="Gzip">
    [gzip → AES-256-CBC encrypt → base64 encode]
  </encrypted-data>

  <signature-data en="Base64" co="Gzip">
    [X.509 cert chain + digital signature → gzip → base64]
  </signature-data>

  <identity-data en="Base64" co="Gzip">
    [sender identity blob → gzip → base64]
  </identity-data>

</secure-doc>
```

### Field Notes

| Field | Value | Notes |
|---|---|---|
| `v` | 7 | Format version — has been at 7 for many years |
| `mv` | 3 | Minor version |
| `rv` | 1 | Revision |
| `ksURL` | `http://localhost:8080/ks/ks` | Key server URL — localhost means server calls itself |
| `ty` | SSMAIL | Type: Secure Sender MAIL |
| `f` | BINARY | Content format |
| `id` | UUID v4 | Message identifier — used to look up AES key in key server |
| `len` | 121709 | Plaintext length in bytes (~119KB) |
| `ct` | `application/octet-stream` | Content MIME type |
| `ci` (on encrypted-data) | AES-256 | Cipher; mode not stated in XML but CBC inferred |
| `co` | Gzip | Compression applied before encryption |
| `en` | Base64 | Transfer encoding of the encrypted blob |

### Processing Pipeline (Encryption, Sender Side)

```
plaintext HTML + attachments
  → gzip compress
  → AES-256 encrypt (key stored in key server, indexed by UUID)
  → base64 encode
  → embed in <encrypted-data> XML element
  → wrap in <secure-doc> XML with UUID reference
  → base64 encode entire XML
  → split into 1,925-char chunks
  → embed as hidden form fields in HTML file
  → attach HTML to wrapper email
```

### Processing Pipeline (Decryption, Recipient Side — Server)

```
recipient opens HTML attachment or portal link
  → browser POSTs 45 form fields to vendor endpoint
  → server reassembles chunks → base64 decode → secure-doc XML
  → extracts message UUID from id= attribute
  → calls internal key server: GET /ks/ks?id=[uuid]
  → key server returns AES-256 key
  → server AES-256 decrypts encrypted-data blob
  → server gzip decompresses → plaintext HTML + attachments
  → server renders in recipient's browser session
```

---

## The Metadata Envelope (rcptData)

Alongside the encrypted payload, a separate metadata envelope is transmitted as a base64-encoded field in the HTML form. This contains routing and permissions data:

```xml
<CourierOptionData>
  <subject>[letter-pair encoded]</subject>
  <reply-to>[sender reply address]</reply-to>
  <reply-from>[recipient address]</reply-from>
  <customer-ID>[encoded customer identifier]</customer-ID>
  <branding-ID>1</branding-ID>
  <reply-enabled>true</reply-enabled>
  <reply-all-enabled>true</reply-all-enabled>
  <include-original>true</include-original>
  <forward-enabled>false</forward-enabled>
  <initiate-enabled>false</initiate-enabled>
  <digest>[HMAC-SHA256 base64]</digest>
</CourierOptionData>
```

### Subject Encoding

The subject line uses a letter-pair substitution encoding, not encryption:

```
Each character → two letters (A–P)
First letter = (char_value >> 4) + ord('A')   (high nibble)
Second letter = (char_value & 0x0F) + ord('A')  (low nibble)

Example: 'C' (ASCII 67 = 0x43)
  High nibble 4 → ord('A') + 4 = 'E'
  Low nibble 3 → ord('A') + 3 = 'D'
  Encoded: 'ED'
```

This is hex encoding with A=0 instead of 0=0. It is trivially reversible by anyone who looks at it. It provides no confidentiality.

### Integrity

The HMAC-SHA256 `digest` field covers the metadata envelope, preventing tampering with permissions flags (e.g., changing `forward-enabled` from false to true). The HMAC key is held by the vendor.

---

## Portal URL Structure

```
https://[branded-subdomain]/formpostdir/securereader?id=[token]&brand=[tenant-id]
```

- `id`: ~32-char base64url token — server-side lookup key for the message
- `brand`: 16-char hex tenant identifier — routes to organisation branding and config

The `id` token is a **bearer token**. Anyone with the URL can attempt portal access. The first-registration flow binds the token to the recipient's email address at registration time. The token itself carries no cryptographic proof of recipient identity.

---

## Email Authentication

```
DKIM-Signature: v=1; a=rsa-sha256; 
  d=[org-sending-domain]; 
  s=pps1;  ← vendor's Proofpoint Protection Server selector
  h=From:To:Subject:Date:...
  bh=[body hash];
  b=[signature];

Authentication-Results: 
  dkim=pass
  spf=pass
  dmarc=pass (p=QUARANTINE)
```

The DKIM selector `pps1` is the vendor's signing infrastructure. The organisation's domain is the `d=` value, creating proper DMARC alignment. This means a spoofed copy of this email would fail DMARC at major mail providers.

---

## Routing Chain (Observed Hops)

```
Hop 1: Internal web/application server (IIS, private RFC1918 subnet)
Hop 2: Internal mail relay (Exchange, private subnet)  
Hop 3: Internet-facing MTA (organisation's own domain, public IP)
Hop 4: Vendor MTA gateway (public IP, vendor infrastructure)
       ← encryption applied here →
Hop 5: Recipient MTA (Gmail, Office 365, etc.)
```

Total transit time observed: ~1–2 minutes from send to delivery.

---

## Format Age & Technical Debt Indicators

| Indicator | Evidence |
|---|---|
| XML namespace date | `/2001/3/` — format designed ~2001 |
| Format version 7 | Has gone through 7 major revisions over ~25 years |
| `localhost:8080` key server | Implies original deployment was co-located single-server |
| 1,925-char chunk size | Legacy URL length limit applied to POST fields |
| AES-CBC (inferred) | AES-GCM (authenticated encryption) preferred since ~2010 |
| No AAD/AEAD | Encryption and authentication are separate concerns |
| gzip before encrypt | Compress-then-encrypt is a valid pattern but shows age |
| `application/octet-stream` content type | Non-specific typing, modern format would use proper MIME |
| Letter-pair subject encoding | Not a cryptographic primitive — pure obfuscation |
| Static HTML help pages | No dynamic content, search, or context-sensitivity |

---

## Suggested SG/Send Protocol Contrast

Where the incumbent uses a 25-year-old XML format with server-custodied keys, SG/Send can use:

```
Payload format: JSON envelope (human-readable, auditable)
Key derivation: Argon2id from passphrase (no key server needed)
Encryption: AES-256-GCM (authenticated encryption — integrity included)
Compression: Brotli or zstd (better ratios than gzip)
Transport: HTTPS PUT to SG/Send storage, URL returned to sender
Recipient access: HTTPS GET → client-side WebCrypto decryption
Integrity: GCM authentication tag (built-in to AEAD)
Metadata: Signed JWT (standard, auditable, not proprietary XML)
```

This eliminates: the key server, the chunked form-POST, the proprietary XML format, the letter-pair encoding, and the server-side decryption step — while being strictly more secure.
