# AppSec Summary for Key Discovery Build

**Source:** `team/roles/appsec/reviews/26-02-21/v0.5.0__appsec__read-now.md`

---

## 3 Things to Address in the Build

### 1. Case-insensitive lookup codes — normalise consistently (Medium)
- Normalise to lowercase at the API boundary (`code.lower()`)
- Store only lowercase
- Generate uppercase for display
- Hash the normalised form in transparency log
- Include a test: publish key, lookup with mixed case, verify it resolves

### 2. Rate limiting — recommended, not blocking (Medium)
- `POST /keys/publish`: 10/hour
- `GET /keys/lookup/{code}`: 60/minute
- `GET /keys/list`: 10/minute
- `DELETE /keys/unpublish/{code}`: 10/hour
- Can be deferred if it slows down the build

### 3. Transparency log — Phase 1 only (Medium)
- Implement as append-only audit trail
- Server computes hash chain
- NOT needed now: client-side verification, external witnesses

---

## Already Handled by Admin Lambda Auth

- POST /api/keys authentication (was Critical → now Low)
- DELETE authentication (was High → now Low)
- Lookup code enumeration (was Medium → now Low)
- Registry membership oracle (was Medium → Informational)
- CORS restrictions (was Medium → Informational)

---

## GRC Risk

When the auth model widens (self-service users, public endpoints, OAuth), many findings escalate to Critical. Track this transition. Full details: `team/roles/appsec/reviews/26-02-21/v0.5.0__grc-risk__auth-model-transition.md`
