# P3 #5: Plaintext in localStorage

**Severity:** P3 — Must fix before production
**Reviewer finding #:** 5
**Reviewer severity:** P1
**Location:** `send-download.js:437`, `api-client.js:26-27`
**Status:** Open
**Related findings:** #9 (key visible in URL), #10 (no CSP) — these three form a chain

---

## What Is the Work?

Decrypted text (up to 50KB) and access tokens are stored as plaintext in localStorage. This data persists across browser sessions and is accessible to any JavaScript running on the page (including XSS). Combined with no Content Security Policy (#10), an XSS attack could exfiltrate the entire decryption history and authentication tokens.

This directly undermines the zero-knowledge promise. The server never sees plaintext — but the browser stores it permanently in an unprotected location.

## What Does Success Look Like?

1. Decryption history is **opt-in**, not default — user explicitly chooses to keep history
2. If history is enabled, stored content uses `sessionStorage` (cleared on tab close) or is encrypted with a user-provided passphrase
3. Access tokens are not stored in plaintext localStorage
4. A "clear all local data" button exists and works completely
5. Test exists that verifies: after decryption, no plaintext persists in localStorage by default
6. The privacy implications are clearly communicated to the user if they opt in to history

## Why P3?

This is the one area where the zero-knowledge guarantee is weakened — not by the crypto or the server, but by client-side data handling after decryption. Combined with no CSP (#10) and key visible in URL (#9), the attack surface is: XSS → read localStorage → exfiltrate decrypted content + tokens + keys.

## Scope

- `send-download.js:437` — decrypted text storage
- `api-client.js:26-27` — access token storage
- Any other localStorage writes that contain sensitive data
- Related: #9 (URL hash clearing) and #10 (CSP) should be fixed as a group

## Known Constraints

- The UX trade-off: history is convenient for users who send/receive frequently. The fix is to make it opt-in with clear privacy messaging, not to remove the capability entirely.
- The DPO should review the privacy implications of any local storage approach.

## Roles

| Role | Responsibility |
|------|---------------|
| Developer | Implement sessionStorage migration, opt-in history, clear-data button |
| AppSec | Validate no plaintext leaks remain, review encrypted storage approach |
| DPO | Review privacy implications of local storage approaches |
| QA | Write tests for default-no-storage, opt-in flow, clear-data completeness |
