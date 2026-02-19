# P6-P8 Group: Low-Priority Hardening

**Severity:** P6-P8 — Minor improvements, cosmetic, theoretical, negligible
**Findings:** #11, #12, #16, #17, #18, #19, #20, #21, #22, #24, #25, #26, #27, #28, #29
**Status:** Open

---

## P6 — Minor Improvements (7 findings)

| # | Finding | Location | Notes |
|---|---------|----------|-------|
| 11 | Transfer ID only 48-bit entropy — collision at ~19.7M transfers | `Transfer__Service.py:46` | We're nowhere near 19.7M transfers |
| 12 | No security headers (Referrer-Policy, HSTS, X-Frame-Options) | All responses | Standard hardening. Hash fragments not leaked via Referer per HTTP spec |
| 18 | Filename from SGMETA not sanitised | `send-download.js:377-378, 467` | Browser `download` attribute provides partial sanitisation |
| 19 | LaunchList form on download page — third-party form on decryption page | `download.html` (all versions) | v0.1.1+ removed external JS. Form-only risk is low |
| 20 | Transfer existence oracle — unauthenticated info endpoint leaks metadata | `Routes__Transfers.py:112-118` | Transfer ID entropy makes enumeration impractical |
| 26 | Silent exception swallowing at security boundaries | `Routes__Transfers.py:107-108`, `Middleware__Analytics.py:73` | Operational/forensic gap, not directly exploitable |
| 28 | Static assets served from Python Lambda — same process as API | Lambda architecture | Architectural concern. Requires dependency compromise first |

## P7 — Cosmetic / Theoretical (7 findings)

| # | Finding | Location | Notes |
|---|---------|----------|-------|
| 16 | Plaintext file size + MIME type sent to server | `api-client.js:51-59` | 28-byte overhead difference is negligible. Reviewer agrees |
| 17 | SGMETA integer overflow | `send-download.js:171-172` | Requires crafting payload inside encrypted content (needs the key). JS is memory-safe |
| 21 | Unbounded events array | `Transfer__Service.py:127` | Requires ~100K downloads to impact performance |
| 22 | Upload size never validated — declared vs actual never compared | `Routes__Transfers.py`, `Transfer__Service.py` | No direct security impact from size mismatch |
| 25 | Token status leaked in error messages | `Routes__Transfers.py:46` | Minor info disclosure, doesn't enable further attack |
| 27 | Unvalidated token_name in URL path | `Admin__Service__Client.py:18,24` | `Safe_Str__Id` likely restricts to URL-safe chars already |
| 29 | No SRI on external scripts | v0.1.0 only | v0.1.6 has no external JS. Historical only |

## P8 — Negligible (1 finding)

| # | Finding | Location | Notes |
|---|---------|----------|-------|
| 24 | Zero-byte payload accepted | `Routes__Transfers.py:79` | Edge case. Minimal impact |

---

## Approach

These findings are tracked for completeness and will be addressed opportunistically. GRC will classify each as fix-later or risk-accepted, and prepare risk acceptance statements for the human to sign off on.

No dedicated sprint allocation. Fix when touching nearby code.
